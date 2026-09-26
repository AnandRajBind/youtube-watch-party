import { PlaybackState, Role } from '../types/room.types';
import { ApiError } from '../utils/apiError';
import {
  canControlPlayback,
  canManageRoles,
  canRemoveParticipant,
  canTransferHost,
} from './permissionService';

export class SyncService {
  /**
   * Calculates current authoritative virtual time of playback.
   * If video is playing, elapsed real-time since last update is added to recorded playbackTime.
   */
  public calculateCurrentPlaybackTime(playbackState: PlaybackState, playbackTime: number, lastUpdatedAt: Date): number {
    if (playbackState === PlaybackState.PAUSED) {
      return playbackTime;
    }

    const elapsedSeconds = (Date.now() - new Date(lastUpdatedAt).getTime()) / 1000;
    const computedTime = playbackTime + Math.max(0, elapsedSeconds);

    return Number(computedTime.toFixed(2));
  }

  /**
   * Validates if the user has permission to control video playback (play, pause, seek, change video).
   * Host and Moderator are allowed; Participant is rejected.
   */
  public assertCanControlPlayback(role: Role): void {
    if (!canControlPlayback(role)) {
      throw ApiError.forbidden(
        'Playback control denied: Only the Host or a Moderator can control video playback.',
        'FORBIDDEN_PLAYBACK_CONTROL'
      );
    }
  }

  /**
   * Validates if the user has permission to manage roles (assign moderator, demote).
   * Only Host is allowed.
   */
  public assertCanManageRoles(role: Role): void {
    if (!canManageRoles(role)) {
      throw ApiError.forbidden(
        'Role management denied: Only the Host can assign or change user roles.',
        'FORBIDDEN_ROLE_MANAGEMENT'
      );
    }
  }

  /**
   * Validates if the user has permission to kick/remove participants.
   * Only Host is allowed.
   */
  public assertCanRemoveParticipant(role: Role): void {
    if (!canRemoveParticipant(role)) {
      throw ApiError.forbidden(
        'Removal denied: Only the Host can remove participants from the room.',
        'FORBIDDEN_REMOVE_PARTICIPANT'
      );
    }
  }

  /**
   * Validates if the user has permission to transfer host.
   * Only Host is allowed.
   */
  public assertCanTransferHost(role: Role): void {
    if (!canTransferHost(role)) {
      throw ApiError.forbidden(
        'Host transfer denied: Only the current Host can transfer room ownership.',
        'FORBIDDEN_HOST_TRANSFER'
      );
    }
  }
}

export const syncService = new SyncService();
