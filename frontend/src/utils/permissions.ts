import type { Role } from '../types/room.types';

/**
 * Centralized Client-Side Permission Matrix
 * Aligned 1:1 with backend permissionService.ts.
 *
 * NOTE: UI restrictions are for user experience and visual guidance only.
 * The backend remains the authoritative authorization layer.
 */

export const permissions = {
  /**
   * Host and Moderator can directly play, pause, seek, and change video.
   */
  canControlPlayback(role: Role): boolean {
    return role === 'host' || role === 'moderator';
  },

  /**
   * Only the Host can assign or change roles (promote/demote).
   */
  canManageRoles(role: Role): boolean {
    return role === 'host';
  },

  /**
   * Only the Host can kick/remove participants from the room.
   */
  canRemoveParticipant(role: Role): boolean {
    return role === 'host';
  },

  /**
   * Only the current Host can transfer room ownership.
   */
  canTransferHost(role: Role): boolean {
    return role === 'host';
  },

  /**
   * Both Host and Moderator can review, approve, and reject participant requests.
   */
  canApproveRequests(role: Role): boolean {
    return role === 'host' || role === 'moderator';
  },

  isHost(role: Role): boolean {
    return role === 'host';
  },

  isModerator(role: Role): boolean {
    return role === 'moderator';
  },

  isParticipant(role: Role): boolean {
    return role === 'participant';
  },
};
