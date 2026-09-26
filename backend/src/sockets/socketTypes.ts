import { Socket } from 'socket.io';
import { PlaybackState, Role, SafeParticipantDto } from '../types/room.types';

// Standard Socket.IO Event Names
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
  TRANSFER_HOST: 'transfer_host',
  REQUEST_ACTION: 'request_action',
  APPROVE_ACTION: 'approve_action',
  REJECT_ACTION: 'reject_action',

  // Server to Client
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

export interface PlayPayload {
  currentTime?: number;
}

export interface PausePayload {
  currentTime?: number;
}

export interface SeekPayload {
  time: number;
}

export interface ChangeVideoPayload {
  videoId: string;
}

export interface AssignRolePayload {
  userId?: string;
  role?: string;
  targetUserId?: string;
  newRole?: string;
}

export interface RemoveParticipantPayload {
  targetUserId: string;
}

export interface TransferHostPayload {
  targetUserId: string;
}

export type ActionRequestType = 'play' | 'pause' | 'seek' | 'change_video';

export interface RequestActionPayload {
  action: ActionRequestType;
  time?: number;
  currentTime?: number;
  videoId?: string;
}

export interface ApproveActionPayload {
  requestId: string;
}

export interface RejectActionPayload {
  requestId: string;
  reason?: string;
}

export interface ActionRequestItem {
  requestId: string;
  roomCode: string;
  requesterUserId: string;
  requesterUsername: string;
  action: ActionRequestType;
  time?: number;
  videoId?: string;
  createdAt: number;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
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
