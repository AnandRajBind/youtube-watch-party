import { IParticipantPresence, PlaybackState, Role } from './room.types';

// Standardized WebSocket Event Names
export const SOCKET_EVENTS = {
  // Client to Server
  JOIN_ROOM: 'join_room',
  LEAVE_ROOM: 'leave_room',
  SYNC_STATE: 'sync_state',
  PLAY: 'play',
  PAUSE: 'pause',
  SEEK: 'seek',
  CHANGE_VIDEO: 'change_video',
  ASSIGN_ROLE: 'assign_role',
  REMOVE_PARTICIPANT: 'remove_participant',

  // Server to Client
  USER_JOINED: 'user_joined',
  USER_LEFT: 'user_left',
  ROLE_ASSIGNED: 'role_assigned',
  PARTICIPANT_REMOVED: 'participant_removed',
  ERROR: 'error',
} as const;

export type SocketEventType = typeof SOCKET_EVENTS[keyof typeof SOCKET_EVENTS];

// Client -> Server Payloads
export interface JoinRoomPayload {
  roomCode: string;
  userId: string;
  username: string;
}

export interface LeaveRoomPayload {
  roomCode: string;
  userId: string;
}

export interface SyncStateRequestPayload {
  roomCode: string;
}

export interface PlaybackControlPayload {
  roomCode: string;
  currentTime: number;
}

export interface SeekPayload {
  roomCode: string;
  targetTime: number;
}

export interface ChangeVideoPayload {
  roomCode: string;
  videoUrlOrId: string;
}

export interface AssignRolePayload {
  roomCode: string;
  targetUserId: string;
  newRole: Role.MODERATOR | Role.PARTICIPANT;
}

export interface RemoveParticipantPayload {
  roomCode: string;
  targetUserId: string;
}

// Server -> Client Payloads
export interface SyncStateResponsePayload {
  currentVideoId: string;
  playbackState: PlaybackState;
  playbackTime: number;
  serverTimestamp: number;
  participants: IParticipantPresence[];
  userRole: Role;
}

export interface UserJoinedBroadcastPayload {
  user: IParticipantPresence;
  participantCount: number;
}

export interface UserLeftBroadcastPayload {
  userId: string;
  username: string;
  participantCount: number;
}

export interface PlaybackBroadcastPayload {
  currentTime: number;
  serverTimestamp: number;
  triggeredBy: string;
}

export interface SeekBroadcastPayload {
  targetTime: number;
  serverTimestamp: number;
  triggeredBy: string;
}

export interface VideoChangedBroadcastPayload {
  videoId: string;
  playbackState: PlaybackState;
  playbackTime: number;
  serverTimestamp: number;
  triggeredBy: string;
}

export interface RoleAssignedBroadcastPayload {
  targetUserId: string;
  newRole: Role;
  updatedBy: string;
}

export interface ParticipantRemovedBroadcastPayload {
  targetUserId: string;
  removedBy: string;
}
