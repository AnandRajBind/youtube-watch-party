import { Role } from '../types/room.types';
import { ApiError } from '../utils/apiError';

/**
 * Granular application permissions
 */
export enum Permission {
  PLAY = 'play',
  PAUSE = 'pause',
  SEEK = 'seek',
  CHANGE_VIDEO = 'change_video',
  ASSIGN_ROLE = 'assign_role',
  REMOVE_PARTICIPANT = 'remove_participant',
  TRANSFER_HOST = 'transfer_host',
}

/**
 * Centralized Role-to-Permission Mapping Matrix
 *
 * HOST: Full control over playback, room settings, and member moderation.
 * MODERATOR: Granted playback control (play, pause, seek, change_video).
 * PARTICIPANT: Watch only. Cannot mutate playback, video, or participants.
 */
const PERMISSION_MATRIX: Record<Role, Set<Permission>> = {
  [Role.HOST]: new Set([
    Permission.PLAY,
    Permission.PAUSE,
    Permission.SEEK,
    Permission.CHANGE_VIDEO,
    Permission.ASSIGN_ROLE,
    Permission.REMOVE_PARTICIPANT,
    Permission.TRANSFER_HOST,
  ]),
  [Role.MODERATOR]: new Set([
    Permission.PLAY,
    Permission.PAUSE,
    Permission.SEEK,
    Permission.CHANGE_VIDEO,
  ]),
  [Role.PARTICIPANT]: new Set([
    // Participant has zero mutation permissions (watch-only)
  ]),
};

/**
 * Checks if a given role has a specific permission.
 */
export function hasPermission(role: Role, permission: Permission): boolean {
  const permissions = PERMISSION_MATRIX[role];
  return Boolean(permissions && permissions.has(permission));
}

/**
 * Enforces that a role is within the allowed roles list.
 * Throws a standardized ApiError(403, 'FORBIDDEN') if unauthorized.
 */
export function requireRole(
  actualRole: Role,
  allowedRoles: Role[],
  actionDescription: string = 'perform this action'
): void {
  if (!allowedRoles.includes(actualRole)) {
    throw ApiError.forbidden(
      `Permission denied: Only ${allowedRoles.join(' or ')} can ${actionDescription}.`,
      'FORBIDDEN'
    );
  }
}

/**
 * Helper: checks if the role is HOST.
 */
export function isHost(role: Role): boolean {
  return role === Role.HOST;
}

/**
 * Helper: checks if the role can control playback (play, pause, seek, change_video).
 * Allowed for Host and Moderator.
 */
export function canControlPlayback(role: Role): boolean {
  return hasPermission(role, Permission.PLAY);
}

/**
 * Helper: checks if the role can manage roles (promote to moderator, demote).
 * Allowed only for Host.
 */
export function canManageRoles(role: Role): boolean {
  return hasPermission(role, Permission.ASSIGN_ROLE);
}

/**
 * Helper: checks if the role can kick/remove participants from the room.
 * Allowed only for Host.
 */
export function canRemoveParticipant(role: Role): boolean {
  return hasPermission(role, Permission.REMOVE_PARTICIPANT);
}

/**
 * Helper: checks if the role can transfer host ownership.
 * Allowed only for Host.
 */
export function canTransferHost(role: Role): boolean {
  return hasPermission(role, Permission.TRANSFER_HOST);
}

/**
 * Helper: checks if the role can review and approve or reject participant action requests.
 * Allowed for Host and Moderator.
 */
export function canApproveAction(role: Role): boolean {
  return canControlPlayback(role);
}
