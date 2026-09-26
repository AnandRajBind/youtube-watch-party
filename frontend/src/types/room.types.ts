/**
 * Core Domain & API Types for YouTube Watch Party
 * Perfectly aligned with the backend authoritative models.
 */

export type Role = 'host' | 'moderator' | 'participant';

export const Role = {
  HOST: 'host' as Role,
  MODERATOR: 'moderator' as Role,
  PARTICIPANT: 'participant' as Role,
};

export type PlaybackState = 'playing' | 'paused';

export const PlaybackState = {
  PLAYING: 'playing' as PlaybackState,
  PAUSED: 'paused' as PlaybackState,
};

export interface SafeParticipantDto {
  userId: string;
  username: string;
  role: Role;
  joinedAt: string | Date;
  isOnline: boolean;
}

export interface SafeRoomDto {
  roomCode: string;
  hostUserId: string;
  currentVideoId: string;
  playbackState: PlaybackState;
  playbackTime: number;
  lastUpdatedAt: string | Date;
  participants: SafeParticipantDto[];
  participantCount: number;
  createdAt: string | Date;
}

export interface ParticipantSession {
  userId: string;
  username: string;
  role: Role;
  roomCode: string;
}

// REST Request & Response Payloads

export interface CreateRoomRequest {
  username: string;
  initialVideoUrl?: string;
  userId?: string;
}

export interface CreateRoomResponse {
  room: SafeRoomDto;
  hostUser: SafeParticipantDto;
}

export interface JoinRoomRequest {
  username: string;
  userId?: string;
}

export interface JoinRoomResponse {
  room: SafeRoomDto;
  participant: SafeParticipantDto;
  session: ParticipantSession;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface ApiErrorDetail {
  code: string;
  message: string;
  details?: Record<string, string[]>;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorDetail;
}

export interface HealthResponse {
  status: string;
  timestamp: string;
  uptime: number;
  database: {
    status: string;
    readyState: number;
  };
}
