export enum Role {
  HOST = 'host',
  MODERATOR = 'moderator',
  PARTICIPANT = 'participant',
}

export enum PlaybackState {
  PLAYING = 'playing',
  PAUSED = 'paused',
}

/**
 * Persistent participant data stored in MongoDB.
 * Notice: Volatile WebSocket connection identifiers (e.g. socketId)
 * are excluded from MongoDB and managed in runtime memory.
 */
export interface IParticipant {
  userId: string;
  username: string;
  role: Role;
  joinedAt: Date;
}

/**
 * Augmented participant interface including transient runtime presence state.
 */
export interface IParticipantPresence extends IParticipant {
  isOnline: boolean;
}

/**
 * Persistent Room document structure stored in MongoDB.
 */
export interface IRoom {
  roomCode: string;
  hostUserId: string;
  currentVideoId: string;
  playbackState: PlaybackState;
  playbackTime: number;
  lastUpdatedAt: Date;
  participants: IParticipant[];
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

/**
 * Safe Participant DTO returned in REST API responses.
 * Never exposes sensitive or internal DB fields.
 */
export interface SafeParticipantDto {
  userId: string;
  username: string;
  role: Role;
  joinedAt: Date;
  isOnline: boolean;
}

/**
 * Safe Room DTO returned in REST API responses.
 * Hides MongoDB internals (_id, __v, expiresAt) and includes
 * calculated virtual playback time and active online participant counts.
 */
export interface SafeRoomDto {
  roomCode: string;
  hostUserId: string;
  currentVideoId: string;
  playbackState: PlaybackState;
  playbackTime: number;
  lastUpdatedAt: Date;
  participants: SafeParticipantDto[];
  participantCount: number;
  createdAt: Date;
}
