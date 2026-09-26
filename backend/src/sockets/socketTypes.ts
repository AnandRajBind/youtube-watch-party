import { Socket } from 'socket.io';
import { PlaybackState, Role, SafeParticipantDto } from '../types/room.types';

// Standard Socket.IO Event Names
export const SOCKET_EVENTS = {
  // Client to Server
  JOIN_ROOM: 'join_room',
  LEAVE_ROOM: 'leave_room',
  SYNC_STATE: 'sync_state',

  // Server to Client
  USER_JOINED: 'user_joined',
  USER_LEFT: 'user_left',
  PARTICIPANT_UPDATE: 'participant_update',
  ERROR: 'error',
} as const;

export type SocketEventType = typeof SOCKET_EVENTS[keyof typeof SOCKET_EVENTS];

// Client -> Server Event Payloads
export interface JoinRoomPayload {
  roomId?: string;
  roomCode?: string;
  username: string;
  userId?: string;
}

export interface LeaveRoomPayload {
  roomId?: string;
  roomCode?: string;
}

// Runtime Memory Representation of a Connected Participant
export interface RuntimeParticipant {
  socketId: string;
  userId: string;
  username: string;
  role: Role;
  roomCode: string;
  connectedAt: Date;
}

// Session data attached to socket.data for fast verified lookups
export interface SocketSessionData {
  userId: string;
  username: string;
  role: Role;
  roomCode: string;
}

// Typed Socket with custom session data
export type CustomSocket = Socket<any, any, any, { session?: SocketSessionData }>;

// Server -> Client Payloads
export interface SyncStatePayload {
  playState: PlaybackState;
  currentTime: number;
  videoId: string;
  roomCode: string;
  roomId: string;
  userRole: Role;
  serverTimestamp: number;
  participants: SafeParticipantDto[];
}

export interface UserJoinedPayload {
  user: SafeParticipantDto;
  participantCount: number;
  roomCode: string;
  roomId: string;
}

export interface UserLeftPayload {
  userId: string;
  username: string;
  participantCount: number;
  roomCode: string;
  roomId: string;
}

export interface ParticipantUpdatePayload {
  participants: SafeParticipantDto[];
  participantCount: number;
}

export interface SocketErrorPayload {
  code: string;
  message: string;
}
