import crypto from 'crypto';
import { RoomModel } from '../models/Room';
import {
  IParticipant,
  IRoom,
  PlaybackState,
  Role,
  SafeParticipantDto,
  SafeRoomDto,
} from '../types/room.types';
import { ApiError } from '../utils/apiError';
import { generateRoomCode } from '../utils/roomCode';
import { extractYouTubeVideoId } from '../utils/youtube';
import { syncService } from './syncService';
import { isUserOnlineInRoom } from '../sockets/roomSocket';

export class RoomService {
  /**
   * Transforms an IRoom into a clean, safe DTO.
   * Strips all internal MongoDB metadata (_id, __v, expiresAt).
   */
  public toSafeRoomDto(room: IRoom, calculatedTime: number): SafeRoomDto {
    const safeParticipants: SafeParticipantDto[] = room.participants.map((p) => ({
      userId: p.userId,
      username: p.username,
      role: p.role,
      joinedAt: p.joinedAt,
      isOnline: isUserOnlineInRoom(room.roomCode, p.userId),
    }));

    return {
      roomCode: room.roomCode,
      hostUserId: room.hostUserId,
      currentVideoId: room.currentVideoId,
      playbackState: room.playbackState,
      playbackTime: calculatedTime,
      lastUpdatedAt: room.lastUpdatedAt,
      participants: safeParticipants,
      participantCount: safeParticipants.length,
      createdAt: room.createdAt,
    };
  }

  /**
   * Retrieves safe room information without exposing internal DB structures.
   */
  public async getSafeRoomDetails(roomCode: string): Promise<SafeRoomDto> {
    const roomWithTime = await this.getRoomByCode(roomCode);
    return this.toSafeRoomDto(roomWithTime, roomWithTime.currentCalculatedTime);
  }

  /**
   * Creates a new watch party room in MongoDB.
   * Host is automatically assigned to the room creator.
   */
  public async createRoom(
    username: string,
    initialVideoUrl?: string,
    providedUserId?: string
  ): Promise<{ room: SafeRoomDto; hostUser: SafeParticipantDto }> {
    const trimmedUsername = username?.trim();
    if (!trimmedUsername) {
      throw ApiError.badRequest('Username is required to create a room');
    }

    const hostUserId = providedUserId || crypto.randomUUID();
    let videoId = 'dQw4w9WgXcQ'; // Default YouTube fallback video

    if (initialVideoUrl) {
      const extracted = extractYouTubeVideoId(initialVideoUrl);
      if (!extracted) {
        throw ApiError.badRequest('Invalid YouTube URL or Video ID provided');
      }
      videoId = extracted;
    }

    let roomCode = generateRoomCode();
    // Ensure room code uniqueness in MongoDB
    let existing = await RoomModel.findOne({ roomCode });
    let attempts = 0;
    while (existing && attempts < 5) {
      roomCode = generateRoomCode();
      existing = await RoomModel.findOne({ roomCode });
      attempts++;
    }

    // Host is automatically assigned when room is created
    const hostParticipant: IParticipant = {
      userId: hostUserId,
      username: trimmedUsername,
      role: Role.HOST,
      joinedAt: new Date(),
    };

    const roomDoc = await RoomModel.create({
      roomCode,
      hostUserId,
      currentVideoId: videoId,
      playbackState: PlaybackState.PAUSED,
      playbackTime: 0,
      lastUpdatedAt: new Date(),
      participants: [hostParticipant],
    });

    const roomObj = roomDoc.toObject() as IRoom;

    return {
      room: this.toSafeRoomDto(roomObj, 0),
      hostUser: {
        ...hostParticipant,
        isOnline: false,
      },
    };
  }

  /**
   * Retrieves room by roomCode and computes current real-time playback position.
   */
  public async getRoomByCode(roomCode: string): Promise<IRoom & { currentCalculatedTime: number }> {
    const code = roomCode?.trim().toUpperCase();
    const room = await RoomModel.findOne({ roomCode: code });

    if (!room) {
      throw ApiError.notFound(`Room with code '${roomCode}' not found`, 'ROOM_NOT_FOUND');
    }

    const roomObj = room.toObject() as IRoom;
    const currentCalculatedTime = syncService.calculateCurrentPlaybackTime(
      roomObj.playbackState,
      roomObj.playbackTime,
      roomObj.lastUpdatedAt
    );

    return {
      ...roomObj,
      currentCalculatedTime,
    };
  }

  /**
   * Joins a room.
   * New users are assigned the 'participant' role by default.
   * If an existing user reconnects, their assigned role (host or moderator) is preserved.
   */
  public async joinRoom(
    roomCode: string,
    userId: string,
    username: string
  ): Promise<{
    room: SafeRoomDto;
    participant: SafeParticipantDto;
    session: { userId: string; username: string; role: Role; roomCode: string };
  }> {
    const code = roomCode?.trim().toUpperCase();
    const room = await RoomModel.findOne({ roomCode: code });

    if (!room) {
      throw ApiError.notFound(`Room with code '${roomCode}' not found`, 'ROOM_NOT_FOUND');
    }

    const cleanUsername = username?.trim() || 'Anonymous';
    let participant = room.participants.find((p) => p.userId === userId);

    if (participant) {
      // Rejoining user: preserve persistent role
      participant.username = cleanUsername;
      if (room.hostUserId === userId) {
        participant.role = Role.HOST;
      }
    } else {
      // New user joining: default to 'participant' (or 'host' if creator)
      const role = room.hostUserId === userId ? Role.HOST : Role.PARTICIPANT;

      const newParticipant: IParticipant = {
        userId,
        username: cleanUsername,
        role,
        joinedAt: new Date(),
      };

      room.participants.push(newParticipant as any);
      participant = room.participants[room.participants.length - 1];
    }

    // Refresh TTL expiration on activity
    room.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await room.save();

    const roomObj = room.toObject() as IRoom;
    const currentCalculatedTime = syncService.calculateCurrentPlaybackTime(
      roomObj.playbackState,
      roomObj.playbackTime,
      roomObj.lastUpdatedAt
    );
    const safeRoom = this.toSafeRoomDto(roomObj, currentCalculatedTime);

    const safeParticipant: SafeParticipantDto = {
      userId: participant.userId,
      username: participant.username,
      role: participant.role,
      joinedAt: participant.joinedAt,
      isOnline: isUserOnlineInRoom(code, participant.userId),
    };

    return {
      room: safeRoom,
      participant: safeParticipant,
      session: {
        userId: participant.userId,
        username: participant.username,
        role: participant.role,
        roomCode: safeRoom.roomCode,
      },
    };
  }

  /**
   * Updates playback state (PLAY or PAUSE) with backend permission check.
   * Host and Moderator are allowed.
   */
  public async updatePlayback(
    roomCode: string,
    requesterUserId: string,
    playbackState: PlaybackState,
    playbackTime: number
  ): Promise<{ playbackState: PlaybackState; playbackTime: number; lastUpdatedAt: Date; triggeredBy: string }> {
    const room = await RoomModel.findOne({ roomCode: roomCode?.trim().toUpperCase() });
    if (!room) {
      throw ApiError.notFound('Room not found', 'ROOM_NOT_FOUND');
    }

    const requester = room.participants.find((p) => p.userId === requesterUserId);
    if (!requester) {
      throw ApiError.unauthorized('Requester is not a member of this room');
    }

    // Backend permission check (Host or Moderator only)
    syncService.assertCanControlPlayback(requester.role);

    room.playbackState = playbackState;
    room.playbackTime = Math.max(0, playbackTime);
    room.lastUpdatedAt = new Date();

    await room.save();

    return {
      playbackState: room.playbackState,
      playbackTime: room.playbackTime,
      lastUpdatedAt: room.lastUpdatedAt,
      triggeredBy: requester.username,
    };
  }

  /**
   * Seeks playback to target timestamp with backend permission check.
   */
  public async seekPlayback(
    roomCode: string,
    requesterUserId: string,
    targetTime: number
  ): Promise<{ targetTime: number; lastUpdatedAt: Date; triggeredBy: string }> {
    const room = await RoomModel.findOne({ roomCode: roomCode?.trim().toUpperCase() });
    if (!room) {
      throw ApiError.notFound('Room not found', 'ROOM_NOT_FOUND');
    }

    const requester = room.participants.find((p) => p.userId === requesterUserId);
    if (!requester) {
      throw ApiError.unauthorized('Requester is not a member of this room');
    }

    // Backend permission check (Host or Moderator only)
    syncService.assertCanControlPlayback(requester.role);

    room.playbackTime = Math.max(0, targetTime);
    room.lastUpdatedAt = new Date();

    await room.save();

    return {
      targetTime: room.playbackTime,
      lastUpdatedAt: room.lastUpdatedAt,
      triggeredBy: requester.username,
    };
  }

  /**
   * Changes YouTube video with backend permission check.
   */
  public async changeVideo(
    roomCode: string,
    requesterUserId: string,
    videoUrlOrId: string
  ): Promise<{ currentVideoId: string; triggeredBy: string }> {
    const room = await RoomModel.findOne({ roomCode: roomCode?.trim().toUpperCase() });
    if (!room) {
      throw ApiError.notFound('Room not found', 'ROOM_NOT_FOUND');
    }

    const requester = room.participants.find((p) => p.userId === requesterUserId);
    if (!requester) {
      throw ApiError.unauthorized('Requester is not a member of this room');
    }

    // Backend permission check (Host or Moderator only)
    syncService.assertCanControlPlayback(requester.role);

    const videoId = extractYouTubeVideoId(videoUrlOrId);
    if (!videoId) {
      throw ApiError.badRequest('Invalid YouTube URL or Video ID');
    }

    room.currentVideoId = videoId;
    room.playbackState = PlaybackState.PAUSED;
    room.playbackTime = 0;
    room.lastUpdatedAt = new Date();

    await room.save();

    return {
      currentVideoId: room.currentVideoId,
      triggeredBy: requester.username,
    };
  }

  /**
   * Promotes a participant to moderator or demotes to participant.
   * Backend enforces that ONLY the Host can perform this action.
   */
  public async assignRole(
    roomCode: string,
    requesterUserId: string,
    targetUserId: string,
    newRole: Role | string
  ): Promise<{ userId: string; role: Role; targetUserId: string; newRole: Role; updatedBy: string }> {
    const room = await RoomModel.findOne({ roomCode: roomCode?.trim().toUpperCase() });
    if (!room) {
      throw ApiError.notFound('Room not found', 'ROOM_NOT_FOUND');
    }

    const requester = room.participants.find((p) => p.userId === requesterUserId);
    if (!requester) {
      throw ApiError.unauthorized('Requester is not a member of this room', 'NOT_A_MEMBER');
    }

    // Backend permission check: ONLY HOST can assign roles
    syncService.assertCanManageRoles(requester.role);

    // Reject attempt to assign host through this event
    const normalizedRole = (newRole || '').toLowerCase();
    if (normalizedRole === Role.HOST || normalizedRole === 'host') {
      throw ApiError.badRequest(
        'Cannot assign host role through assign_role event. Multiple hosts are not allowed. Use transfer_host to change room ownership.',
        'CANNOT_ASSIGN_HOST_ROLE'
      );
    }

    // Target role must be either moderator or participant
    if (normalizedRole !== Role.MODERATOR && normalizedRole !== Role.PARTICIPANT) {
      throw ApiError.badRequest(
        "Invalid role: Target role must be either 'moderator' or 'participant'",
        'INVALID_ROLE'
      );
    }

    const target = room.participants.find((p) => p.userId === targetUserId);
    if (!target) {
      throw ApiError.notFound('Target user not found in this room', 'USER_NOT_FOUND');
    }

    // Protect Host role: host role cannot be altered via assign_role
    if (target.userId === room.hostUserId) {
      throw ApiError.badRequest(
        'Cannot alter the role of the room Host. The host role is protected.',
        'PROTECTED_HOST_ROLE'
      );
    }

    const validatedRole = normalizedRole as Role.MODERATOR | Role.PARTICIPANT;
    target.role = validatedRole;
    await room.save();

    return {
      userId: targetUserId,
      role: validatedRole,
      targetUserId,
      newRole: validatedRole,
      updatedBy: requester.username,
    };
  }

  /**
   * Removes / kicks a participant from the room.
   * Backend enforces that ONLY the Host can remove participants.
   */
  public async removeParticipant(
    roomCode: string,
    requesterUserId: string,
    targetUserId: string
  ): Promise<{ targetUserId: string; removedBy: string }> {
    const room = await RoomModel.findOne({ roomCode: roomCode?.trim().toUpperCase() });
    if (!room) {
      throw ApiError.notFound('Room not found', 'ROOM_NOT_FOUND');
    }

    const requester = room.participants.find((p) => p.userId === requesterUserId);
    if (!requester) {
      throw ApiError.unauthorized('Requester is not a member of this room');
    }

    // Backend permission check: ONLY HOST can remove participants
    syncService.assertCanRemoveParticipant(requester.role);

    if (targetUserId === room.hostUserId || targetUserId === requester.userId) {
      throw ApiError.badRequest('Host cannot be removed from the room');
    }

    const targetIndex = room.participants.findIndex((p) => p.userId === targetUserId);
    if (targetIndex === -1) {
      throw ApiError.notFound('Target participant not found in room');
    }

    room.participants.splice(targetIndex, 1);
    await room.save();

    return {
      targetUserId,
      removedBy: requester.username,
    };
  }

  /**
   * Transfers room Host ownership to another participant.
   * Backend enforces that ONLY the current Host can transfer room ownership.
   */
  public async transferHost(
    roomCode: string,
    requesterUserId: string,
    targetUserId: string
  ): Promise<{ previousHostUserId: string; newHostUserId: string; updatedBy: string }> {
    const room = await RoomModel.findOne({ roomCode: roomCode?.trim().toUpperCase() });
    if (!room) {
      throw ApiError.notFound('Room not found', 'ROOM_NOT_FOUND');
    }

    const requester = room.participants.find((p) => p.userId === requesterUserId);
    if (!requester) {
      throw ApiError.unauthorized('Requester is not a member of this room');
    }

    // Backend permission check: ONLY HOST can transfer host
    syncService.assertCanTransferHost(requester.role);
    if (room.hostUserId !== requesterUserId) {
      throw ApiError.forbidden(
        'Host transfer denied: Only the current Host can transfer room ownership.',
        'FORBIDDEN_HOST_TRANSFER'
      );
    }

    if (requesterUserId === targetUserId) {
      throw ApiError.badRequest('Target user is already the Host');
    }

    const target = room.participants.find((p) => p.userId === targetUserId);
    if (!target) {
      throw ApiError.notFound('Target participant not found in room');
    }

    // Previous host becomes Moderator, target becomes Host
    requester.role = Role.MODERATOR;
    target.role = Role.HOST;
    room.hostUserId = targetUserId;

    await room.save();

    return {
      previousHostUserId: requesterUserId,
      newHostUserId: targetUserId,
      updatedBy: requester.username,
    };
  }
}

export const roomService = new RoomService();
