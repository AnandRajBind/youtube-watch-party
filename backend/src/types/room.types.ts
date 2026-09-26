export enum Role {
  HOST = 'HOST',
  MODERATOR = 'MODERATOR',
  PARTICIPANT = 'PARTICIPANT',
}

export enum PlaybackStatus {
  PLAYING = 'PLAYING',
  PAUSED = 'PAUSED',
}

export interface IParticipant {
  userId: string;
  socketId: string;
  username: string;
  role: Role;
  joinedAt: Date;
  isOnline: boolean;
}

export interface IVideoState {
  videoId: string;
  title?: string;
  duration?: number;
}

export interface IPlaybackState {
  status: PlaybackStatus;
  currentTime: number;
  lastUpdatedAt: Date;
}

export interface IRoom {
  roomCode: string;
  title: string;
  hostUserId: string;
  video: IVideoState;
  playback: IPlaybackState;
  participants: IParticipant[];
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}
