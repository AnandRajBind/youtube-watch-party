import { IPlaybackState, PlaybackStatus, Role } from '../types/room.types';
import { ApiError } from '../utils/apiError';

export class SyncService {
  /**
   * Calculates current authoritative virtual time of playback.
   * If video is playing, elapsed real-time since last update is added to currentTime.
   */
  public calculateCurrentPlaybackTime(playback: IPlaybackState): number {
    if (playback.status === PlaybackStatus.PAUSED) {
      return playback.currentTime;
    }

    const elapsedSeconds = (Date.now() - new Date(playback.lastUpdatedAt).getTime()) / 1000;
    const computedTime = playback.currentTime + Math.max(0, elapsedSeconds);

    return Number(computedTime.toFixed(2));
  }

  /**
   * Validates if the user has permission to control video playback (play, pause, seek, change video).
   * Host and Moderator are allowed; Participant is rejected.
   */
  public assertCanControlPlayback(role: Role): void {
    if (role !== Role.HOST && role !== Role.MODERATOR) {
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
    if (role !== Role.HOST) {
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
    if (role !== Role.HOST) {
      throw ApiError.forbidden(
        'Removal denied: Only the Host can remove participants from the room.',
        'FORBIDDEN_REMOVE_PARTICIPANT'
      );
    }
  }
}

export const syncService = new SyncService();
