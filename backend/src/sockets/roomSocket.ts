import { Server as SocketIOServer } from 'socket.io';
import { RoomModel } from '../models/Room';
import { roomService } from '../services/roomService';
import { IParticipant, Role, SafeParticipantDto, SafeRoomDto } from '../types/room.types';
import { RuntimeParticipant, SOCKET_EVENTS } from './socketTypes';
import { ApiError } from '../utils/apiError';
import { logger } from '../utils/logger';

// ============================================================================
// 1. RUNTIME MEMORY STORE (Volatile State)
// ============================================================================

/**
 * Maps socketId -> RuntimeParticipant
 */
const socketToParticipant = new Map<string, RuntimeParticipant>();

/**
 * Maps roomCode -> Set of active socketIds
 */
const roomToSockets = new Map<string, Set<string>>();

/**
 * Maps "roomCode:userId" -> Set of socketIds (handles multiple tabs for same user)
 */
const userToSockets = new Map<string, Set<string>>();

function getUserKey(roomCode: string, userId: string): string {
  return `${roomCode.toUpperCase()}:${userId}`;
}

export function addRuntimeParticipant(participant: RuntimeParticipant): void {
  const { socketId, userId, roomCode } = participant;
  const code = roomCode.toUpperCase();

  socketToParticipant.set(socketId, participant);

  // Track room sockets
  if (!roomToSockets.has(code)) {
    roomToSockets.set(code, new Set());
  }
  roomToSockets.get(code)!.add(socketId);

  // Track user sockets
  const userKey = getUserKey(code, userId);
  if (!userToSockets.has(userKey)) {
    userToSockets.set(userKey, new Set());
  }
  userToSockets.get(userKey)!.add(socketId);
}

export function removeRuntimeParticipant(socketId: string): RuntimeParticipant | null {
  const participant = socketToParticipant.get(socketId);
  if (!participant) {
    return null;
  }

  const { roomCode, userId } = participant;
  const code = roomCode.toUpperCase();

  socketToParticipant.delete(socketId);

  // Clean room sockets
  const roomSockets = roomToSockets.get(code);
  if (roomSockets) {
    roomSockets.delete(socketId);
    if (roomSockets.size === 0) {
      roomToSockets.delete(code);
    }
  }

  // Clean user sockets
  const userKey = getUserKey(code, userId);
  const userSockets = userToSockets.get(userKey);
  if (userSockets) {
    userSockets.delete(socketId);
    if (userSockets.size === 0) {
      userToSockets.delete(userKey);
    }
  }

  return participant;
}

export function getRuntimeParticipant(socketId: string): RuntimeParticipant | undefined {
  return socketToParticipant.get(socketId);
}

export function isUserOnlineInRoom(roomCode: string, userId: string): boolean {
  const userKey = getUserKey(roomCode, userId);
  const sockets = userToSockets.get(userKey);
  return Boolean(sockets && sockets.size > 0);
}

export function getOnlineParticipantsInRoom(roomCode: string): RuntimeParticipant[] {
  const code = roomCode.toUpperCase();
  const socketIds = roomToSockets.get(code);
  if (!socketIds) {
    return [];
  }

  const participants: RuntimeParticipant[] = [];
  for (const socketId of socketIds) {
    const p = socketToParticipant.get(socketId);
    if (p) {
      participants.push(p);
    }
  }
  return participants;
}

// ============================================================================
// 2. HELPER FUNCTIONS REQUIRED FOR ROOM SOCKET OPERATIONS
// ============================================================================

/**
 * Helper: get room
 * Fetches safe room details from MongoDB without internal metadata.
 */
export async function getRoom(roomCode: string): Promise<SafeRoomDto> {
  const code = roomCode?.trim().toUpperCase();
  const room = await RoomModel.findOne({ roomCode: code });

  if (!room) {
    throw ApiError.notFound(`Room with code '${roomCode}' does not exist`, 'ROOM_NOT_FOUND');
  }

  return roomService.getSafeRoomDetails(code);
}

/**
 * Helper: get participant
 * Retrieves persistent participant record from MongoDB.
 */
export async function getParticipant(roomCode: string, userId: string): Promise<IParticipant | null> {
  const code = roomCode?.trim().toUpperCase();
  const room = await RoomModel.findOne({ roomCode: code });

  if (!room) {
    return null;
  }

  const participant = room.participants.find((p) => p.userId === userId);
  return participant || null;
}

/**
 * Helper: check role
 * Resolves the user's actual role from server-side persistent data (MongoDB).
 * CRITICAL SECURITY: Never trusts role from client socket events.
 */
export async function checkRole(roomCode: string, userId: string): Promise<Role> {
  const code = roomCode?.trim().toUpperCase();
  const room = await RoomModel.findOne({ roomCode: code });

  if (!room) {
    throw ApiError.notFound('Room not found', 'ROOM_NOT_FOUND');
  }

  // Room creator / host check
  if (room.hostUserId === userId) {
    return Role.HOST;
  }

  const participant = room.participants.find((p) => p.userId === userId);
  return participant ? participant.role : Role.PARTICIPANT;
}

/**
 * Helper: broadcast room state
 * Computes authoritative state and broadcasts sync_state to all room members.
 */
export async function broadcastRoomState(io: SocketIOServer, roomCode: string): Promise<void> {
  const code = roomCode.trim().toUpperCase();
  const roomExists = await RoomModel.exists({ roomCode: code });
  if (!roomExists) return;

  const room = await getRoom(code);

  io.to(code).emit(SOCKET_EVENTS.SYNC_STATE, {
    playState: room.playbackState,
    currentTime: room.playbackTime,
    videoId: room.currentVideoId,
    roomCode: room.roomCode,
    roomId: room.roomCode,
    currentVideoId: room.currentVideoId,
    playbackState: room.playbackState,
    playbackTime: room.playbackTime,
    serverTimestamp: Date.now(),
    participants: room.participants,
    participantCount: room.participantCount,
  });

  logger.debug(`Broadcasted room state for ${code} to ${room.participantCount} participants`);
}

/**
 * Helper: broadcast participants
 * Broadcasts updated participant list with active online status to the room.
 */
export async function broadcastParticipants(io: SocketIOServer, roomCode: string): Promise<void> {
  const code = roomCode.trim().toUpperCase();
  const roomExists = await RoomModel.exists({ roomCode: code });
  if (!roomExists) return;

  const room = await getRoom(code);

  // Combine MongoDB participant data with runtime in-memory presence
  const participantsWithPresence: SafeParticipantDto[] = room.participants.map((p) => ({
    userId: p.userId,
    username: p.username,
    role: p.role,
    joinedAt: p.joinedAt,
    isOnline: isUserOnlineInRoom(code, p.userId),
  }));

  const onlineCount = participantsWithPresence.filter((p) => p.isOnline).length;

  io.to(code).emit(SOCKET_EVENTS.PARTICIPANT_UPDATE, {
    participants: participantsWithPresence,
    participantCount: onlineCount,
  });

  logger.debug(`Broadcasted participant list update for ${code} (${onlineCount} online)`);
}
