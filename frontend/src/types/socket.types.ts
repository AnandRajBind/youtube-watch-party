import type { PlaybackState, Role, SafeParticipantDto } from './room.types';

// Standard Socket.IO Event Names (Exact 1:1 match with backend)
export const SOCKET_EVENTS = {
  // Client -> Server
  JOIN_ROOM: 'join_room',
  LEAVE_ROOM: 'leave_room',
  SYNC_STATE: 'sync_state',
  PLAY: 'play',
  PAUSE: 'pause',
  SEEK: 'seek',
  CHANGE_VIDEO: 'change_video',
  ASSIGN_ROLE: 'assign_role',
  REMOVE_PARTICIPANT: 'remove_participant',
  TRANSFER_HOST: 'transfer_host',
  REQUEST_ACTION: 'request_action',
  APPROVE_ACTION: 'approve_action',
  REJECT_ACTION: 'reject_action',

  // Server -> Client
  USER_JOINED: 'user_joined',
  USER_LEFT: 'user_left',
  PARTICIPANT_UPDATE: 'participant_update',
  ROLE_ASSIGNED: 'role_assigned',
  PARTICIPANT_REMOVED: 'participant_removed',
  HOST_TRANSFERRED: 'host_transferred',
  ACTION_REQUEST_CREATED: 'action_request_created',
  ACTION_REQUEST_APPROVED: 'action_request_approved',
  ACTION_REQUEST_REJECTED: 'action_request_rejected',
  ERROR: 'error',
} as const;

export type SocketEventType = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];

// Client -> Server Payloads
export interface JoinRoomSocketPayload {
  roomCode: string;
  username: string;
  userId?: string;
}

export interface LeaveRoomSocketPayload {
  roomCode: string;
}

export interface PlaySocketPayload {
  currentTime?: number;
}

export interface PauseSocketPayload {
  currentTime?: number;
}

export interface SeekSocketPayload {
  time: number;
}

export interface ChangeVideoSocketPayload {
  videoId: string;
}

export interface AssignRoleSocketPayload {
  targetUserId: string;
  newRole: 'moderator' | 'participant';
}

export interface RemoveParticipantSocketPayload {
  targetUserId: string;
}

export interface TransferHostSocketPayload {
  targetUserId: string;
}

export type ActionRequestType = 'play' | 'pause' | 'seek' | 'change_video';

export interface RequestActionSocketPayload {
  action: ActionRequestType;
  time?: number;
  currentTime?: number;
  videoId?: string;
}

export interface ApproveActionSocketPayload {
  requestId: string;
}

export interface RejectActionSocketPayload {
  requestId: string;
  reason?: string;
}

// Server -> Client Broadcast Payloads
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

export interface PlaybackBroadcastPayload {
  currentTime: number;
  serverTimestamp: number;
  triggeredBy: string;
}

export interface SeekBroadcastPayload {
  currentTime: number;
  serverTimestamp: number;
  triggeredBy: string;
}

export interface ChangeVideoBroadcastPayload {
  videoId: string;
  playState: PlaybackState;
  currentTime: number;
  serverTimestamp: number;
  triggeredBy: string;
}

export interface RoleAssignedBroadcastPayload {
  userId: string;
  role: Role;
  targetUserId: string;
  newRole: Role;
  updatedBy: string;
}

export interface ParticipantRemovedBroadcastPayload {
  targetUserId: string;
  removedBy: string;
  reason?: string;
}

export interface HostTransferredBroadcastPayload {
  previousHostUserId: string;
  newHostUserId: string;
  updatedBy: string;
}

export interface ActionRequestCreatedPayload {
  requestId: string;
  requesterUserId: string;
  requesterUsername: string;
  action: ActionRequestType;
  time?: number;
  videoId?: string;
  createdAt: number;
}

export interface ActionRequestApprovedPayload {
  requestId: string;
  action: ActionRequestType;
  approvedBy: string;
  requesterUserId: string;
  requesterUsername: string;
  time?: number;
  videoId?: string;
}

export interface ActionRequestRejectedPayload {
  requestId: string;
  action: ActionRequestType;
  rejectedBy: string;
  requesterUserId: string;
  requesterUsername: string;
  reason?: string;
}

export interface SocketErrorPayload {
  code: string;
  message: string;
}
