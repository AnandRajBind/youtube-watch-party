import crypto from 'crypto';
import { RoomModel, IRoomDocument } from '../models/Room';
import { IParticipant, IPlaybackState, IRoom, IVideoState, PlaybackStatus, Role } from '../types/room.types';
import { ApiError } from '../utils/apiError';
import { generateRoomCode } from '../utils/roomCode';
import { extractYouTubeVideoId } from '../utils/youtube';
import { syncService } from './syncService';

export class RoomService {
  /**
   * Creates a new watch party room in MongoDB.
   */
  public async createRoom(
    username: string,
    initialVideoUrl?: string,
    title?: string,
    providedUserId?: string
  ): Promise<{ room: IRoom; hostUser: IParticipant }> {
    const trimmedUsername = username?.trim();
    if (!trimmedUsername) {
      throw ApiError.badRequest('Username is required to create a room');
    }

    const hostUserId = providedUserId || crypto.randomUUID();
    let videoId = 'dQw4w9WgXcQ'; // Default Rick Astley fallback video

    if (initialVideoUrl) {
      const extracted = extractYouTubeVideoId(initialVideoUrl);
      if (!extracted) {
        throw ApiError.badRequest('Invalid YouTube URL or Video ID provided');
      }
      videoId = extracted;
    }

    let roomCode = generateRoomCode();
    // Ensure room code uniqueness
    let existing = await RoomModel.findOne({ roomCode });
    let attempts = 0;
    while (existing && attempts < 5) {
      roomCode = generateRoomCode();
      existing = await RoomModel.findOne({ roomCode });
      attempts++;
    }

    const hostParticipant: IParticipant = {
      userId: hostUserId,
      socketId: '',
      username: trimmedUsername,
      role: Role.HOST,
      joinedAt: new Date(),
      isOnline: false,
    };

    const roomDoc = await RoomModel.create({
      roomCode,
      title: title?.trim() || `${trimmedUsername}'s Watch Party`,
      hostUserId,
      video: {
        videoId,
        title: 'YouTube Video',
        duration: 0,
      },
      playback: {
        status: PlaybackStatus.PAUSED,
        currentTime: 0,
        lastUpdatedAt: new Date(),
      },
      participants: [hostParticipant],
    });

    return {
      room: roomDoc.toObject() as IRoom,
      hostUser: hostParticipant,
    };
  }

  /**
   * Retrieves room by roomCode and computes current real-time playback position.
   */
  public async getRoomByCode(roomCode: string): Promise<IRoom> {
    const code = roomCode?.trim().toUpperCase();
    const room = await RoomModel.findOne({ roomCode: code });

    if (!room) {
      throw ApiError.notFound(`Room with code '${roomCode}' not found`, 'ROOM_NOT_FOUND');
    }

    const roomObj = room.toObject() as IRoom;
    // Calculate authoritative current time
    roomObj.playback.currentTime = syncService.calculateCurrentPlaybackTime(roomObj.playback);

    return roomObj;
  }

  /**
   * Joins a room or re-associates an existing participant via socket.
   */
  public async joinRoom(
    roomCode: string,
    userId: string,
    username: string,
    socketId: string
  ): Promise<{ room: IRoom; participant: IParticipant }> {
    const code = roomCode?.trim().toUpperCase();
    const room = await RoomModel.findOne({ roomCode: code });

    if (!room) {
      throw ApiError.notFound(`Room with code '${roomCode}' not found`, 'ROOM_NOT_FOUND');
    }

    const cleanUsername = username?.trim() || 'Anonymous';
    let participant = room.participants.find((p) => p.userId === userId);

    if (participant) {
      // Existing user rejoining / reconnecting
      participant.socketId = socketId;
      participant.isOnline = true;
      participant.username = cleanUsername;

      // If user was recorded as hostUserId, ensure they hold HOST role
      if (room.hostUserId === userId) {
        participant.role = Role.HOST;
      }
    } else {
      // New user joining
      const isRoomCreator = room.hostUserId === userId;
      const role = isRoomCreator ? Role.HOST : Role.PARTICIPANT;

      const newParticipant: IParticipant = {
        userId,
        socketId,
        username: cleanUsername,
        role,
        joinedAt: new Date(),
        isOnline: true,
      };

      room.participants.push(newParticipant as any);
      participant = room.participants[room.participants.length - 1];
    }

    // Refresh TTL expiration
    room.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await room.save();

    const roomObj = room.toObject() as IRoom;
    roomObj.playback.currentTime = syncService.calculateCurrentPlaybackTime(roomObj.playback);

    return {
      room: roomObj,
      participant: participant.toObject ? (participant.toObject() as IParticipant) : (participant as unknown as IParticipant),
    };
  }

  /**
   * Handles user disconnect / leave by socketId.
   */
  public async leaveRoom(socketId: string): Promise<{ room: IRoom; leftUser: IParticipant } | null> {
    const room = await RoomModel.findOne({ 'participants.socketId': socketId });
    if (!room) {
      return null;
    }

    const participant = room.participants.find((p) => p.socketId === socketId);
    if (!participant) {
      return null;
    }

    participant.isOnline = false;
    participant.socketId = '';
    await room.save();

    return {
      room: room.toObject() as IRoom,
      leftUser: participant.toObject ? (participant.toObject() as IParticipant) : (participant as unknown as IParticipant),
    };
  }

  /**
   * Updates playback status (PLAY or PAUSE) with backend permission check.
   */
  public async updatePlayback(
    roomCode: string,
    socketId: string,
    status: PlaybackStatus,
    currentTime: number
  ): Promise<{ playback: IPlaybackState; triggeredBy: string }> {
    const room = await RoomModel.findOne({ roomCode: roomCode?.trim().toUpperCase() });
    if (!room) {
      throw ApiError.notFound('Room not found', 'ROOM_NOT_FOUND');
    }

    const requester = room.participants.find((p) => p.socketId === socketId);
    if (!requester) {
      throw ApiError.unauthorized('Requester not found in room');
    }

    // Strict backend role enforcement
    syncService.assertCanControlPlayback(requester.role);

    room.playback.status = status;
    room.playback.currentTime = Math.max(0, currentTime);
    room.playback.lastUpdatedAt = new Date();

    await room.save();

    return {
      playback: {
        status: room.playback.status,
        currentTime: room.playback.currentTime,
        lastUpdatedAt: room.playback.lastUpdatedAt,
      },
      triggeredBy: requester.username,
    };
  }

  /**
   * Seeks video to target timestamp with backend permission check.
   */
  public async seekPlayback(
    roomCode: string,
    socketId: string,
    targetTime: number
  ): Promise<{ targetTime: number; triggeredBy: string }> {
    const room = await RoomModel.findOne({ roomCode: roomCode?.trim().toUpperCase() });
    if (!room) {
      throw ApiError.notFound('Room not found', 'ROOM_NOT_FOUND');
    }

    const requester = room.participants.find((p) => p.socketId === socketId);
    if (!requester) {
      throw ApiError.unauthorized('Requester not found in room');
    }

    // Strict backend role enforcement
    syncService.assertCanControlPlayback(requester.role);

    room.playback.currentTime = Math.max(0, targetTime);
    room.playback.lastUpdatedAt = new Date();

    await room.save();

    return {
      targetTime: room.playback.currentTime,
      triggeredBy: requester.username,
    };
  }

  /**
   * Changes active YouTube video with backend permission check.
   */
  public async changeVideo(
    roomCode: string,
    socketId: string,
    videoUrlOrId: string
  ): Promise<{ video: IVideoState; triggeredBy: string }> {
    const room = await RoomModel.findOne({ roomCode: roomCode?.trim().toUpperCase() });
    if (!room) {
      throw ApiError.notFound('Room not found', 'ROOM_NOT_FOUND');
    }

    const requester = room.participants.find((p) => p.socketId === socketId);
    if (!requester) {
      throw ApiError.unauthorized('Requester not found in room');
    }

    // Strict backend role enforcement
    syncService.assertCanControlPlayback(requester.role);

    const videoId = extractYouTubeVideoId(videoUrlOrId);
    if (!videoId) {
      throw ApiError.badRequest('Invalid YouTube URL or Video ID');
    }

    room.video.videoId = videoId;
    room.video.title = 'YouTube Video';
    room.playback.status = PlaybackStatus.PAUSED;
    room.playback.currentTime = 0;
    room.playback.lastUpdatedAt = new Date();

    await room.save();

    return {
      video: {
        videoId: room.video.videoId,
        title: room.video.title,
        duration: room.video.duration,
      },
      triggeredBy: requester.username,
    };
  }

  /**
   * Promotes or demotes participant with backend permission check (Host only).
   */
  public async assignRole(
    roomCode: string,
    socketId: string,
    targetUserId: string,
    newRole: Role.MODERATOR | Role.PARTICIPANT
  ): Promise<{ targetUserId: string; newRole: Role; updatedBy: string }> {
    const room = await RoomModel.findOne({ roomCode: roomCode?.trim().toUpperCase() });
    if (!room) {
      throw ApiError.notFound('Room not found', 'ROOM_NOT_FOUND');
    }

    const requester = room.participants.find((p) => p.socketId === socketId);
    if (!requester) {
      throw ApiError.unauthorized('Requester not found in room');
    }

    // Strict backend role enforcement: Only HOST can assign roles
    syncService.assertCanManageRoles(requester.role);

    const target = room.participants.find((p) => p.userId === targetUserId);
    if (!target) {
      throw ApiError.notFound('Target participant not found in room');
    }

    if (target.userId === room.hostUserId) {
      throw ApiError.badRequest('Cannot change role of the Host');
    }

    target.role = newRole;
    await room.save();

    return {
      targetUserId,
      newRole,
      updatedBy: requester.username,
    };
  }

  /**
   * Removes / kicks participant from room with backend permission check (Host only).
   */
  public async removeParticipant(
    roomCode: string,
    socketId: string,
    targetUserId: string
  ): Promise<{ targetUserId: string; targetSocketId: string; removedBy: string }> {
    const room = await RoomModel.findOne({ roomCode: roomCode?.trim().toUpperCase() });
    if (!room) {
      throw ApiError.notFound('Room not found', 'ROOM_NOT_FOUND');
    }

    const requester = room.participants.find((p) => p.socketId === socketId);
    if (!requester) {
      throw ApiError.unauthorized('Requester not found in room');
    }

    // Strict backend role enforcement: Only HOST can kick participants
    syncService.assertCanRemoveParticipant(requester.role);

    if (targetUserId === room.hostUserId || targetUserId === requester.userId) {
      throw ApiError.badRequest('Host cannot be removed from the room');
    }

    const targetIndex = room.participants.findIndex((p) => p.userId === targetUserId);
    if (targetIndex === -1) {
      throw ApiError.notFound('Target participant not found in room');
    }

    const targetSocketId = room.participants[targetIndex].socketId;
    room.participants.splice(targetIndex, 1);
    await room.save();

    return {
      targetUserId,
      targetSocketId,
      removedBy: requester.username,
    };
  }
}

export const roomService = new RoomService();
