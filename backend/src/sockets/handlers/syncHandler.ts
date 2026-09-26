import { Server as SocketIOServer } from 'socket.io';
import { RoomModel } from '../../models/Room';
import { checkRole, getParticipant, getRoom, getRuntimeParticipant } from '../roomSocket';
import { syncService } from '../../services/syncService';
import { extractYouTubeVideoId } from '../../utils/youtube';
import { PlaybackState, Role } from '../../types/room.types';
import {
  ChangeVideoPayload,
  CustomSocket,
  PausePayload,
  PlayPayload,
  SeekPayload,
  SOCKET_EVENTS,
} from '../socketTypes';
import { logger } from '../../utils/logger';

interface AuthorizedContext {
  roomCode: string;
  userId: string;
  username: string;
  role: Role;
}

export function registerSyncHandlers(io: SocketIOServer, socket: CustomSocket): void {
  /**
   * Internal Helper: Authorize and validate incoming playback event.
   *
   * Executes steps 1 - 4:
   * 1. Verify socket / session
   * 2. Verify participant belongs to room
   * 3. Determine actual role strictly from server-side state (MongoDB)
   * 4. Verify permission (Host or Moderator only; Participant rejected)
   */
  async function authorizePlaybackAction(eventName: string): Promise<AuthorizedContext | null> {
    // 1. Verify socket/session
    const session = socket.data.session || getRuntimeParticipant(socket.id);
    if (!session || !session.roomCode || !session.userId) {
      socket.emit(SOCKET_EVENTS.ERROR, {
        code: 'UNAUTHORIZED',
        message: `Authentication required to perform '${eventName}'`,
      });
      return null;
    }

    const { roomCode, userId } = session;

    // 2. Verify participant belongs to the room
    const persistentParticipant = await getParticipant(roomCode, userId);
    if (!persistentParticipant) {
      socket.emit(SOCKET_EVENTS.ERROR, {
        code: 'NOT_A_MEMBER',
        message: 'You are not a member of this room',
      });
      return null;
    }

    // 3. Determine actual role from server-side state
    const actualRole = await checkRole(roomCode, userId);

    // 4. Verify permission (Host or Moderator only)
    if (actualRole !== Role.HOST && actualRole !== Role.MODERATOR) {
      logger.warn(
        `Unauthorized playback attempt: [event=${eventName}, user=${persistentParticipant.username}, role=${actualRole}, room=${roomCode}]`
      );
      socket.emit(SOCKET_EVENTS.ERROR, {
        code: 'FORBIDDEN_PLAYBACK_CONTROL',
        message: 'Permission denied: Only the Host or a Moderator can control playback',
      });
      return null;
    }

    return {
      roomCode,
      userId,
      username: persistentParticipant.username,
      role: actualRole,
    };
  }

  // ==========================================================================
  // EVENT: play
  // Payload: {} or { currentTime?: number }
  // ==========================================================================
  socket.on(SOCKET_EVENTS.PLAY, async (payload?: PlayPayload) => {
    try {
      const auth = await authorizePlaybackAction('play');
      if (!auth) return;

      const { roomCode, username } = auth;
      const room = await RoomModel.findOne({ roomCode });
      if (!room) {
        socket.emit(SOCKET_EVENTS.ERROR, { code: 'ROOM_NOT_FOUND', message: 'Room not found' });
        return;
      }

      // Determine authoritative playhead time
      let targetTime: number;
      if (
        payload &&
        typeof payload.currentTime === 'number' &&
        Number.isFinite(payload.currentTime) &&
        !Number.isNaN(payload.currentTime) &&
        payload.currentTime >= 0
      ) {
        targetTime = Number(payload.currentTime.toFixed(2));
      } else {
        // Calculate virtual playback time from server state
        targetTime = syncService.calculateCurrentPlaybackTime(
          room.playbackState,
          room.playbackTime,
          room.lastUpdatedAt
        );
      }

      // Update authoritative room state in MongoDB
      room.playbackState = PlaybackState.PLAYING;
      room.playbackTime = targetTime;
      room.lastUpdatedAt = new Date();
      await room.save();

      // Broadcast to other members in room (omit sender to prevent duplicate actions / loops)
      socket.to(roomCode).emit(SOCKET_EVENTS.PLAY, {
        currentTime: targetTime,
        serverTimestamp: Date.now(),
        triggeredBy: username,
      });

      logger.info(`[${roomCode}] PLAY at ${targetTime}s by ${username} (${auth.role})`);
    } catch (err: any) {
      logger.error('Error handling play socket event:', err);
      socket.emit(SOCKET_EVENTS.ERROR, {
        code: 'PLAY_ERROR',
        message: 'Failed to process play action',
      });
    }
  });

  // ==========================================================================
  // EVENT: pause
  // Payload: {} or { currentTime?: number }
  // ==========================================================================
  socket.on(SOCKET_EVENTS.PAUSE, async (payload?: PausePayload) => {
    try {
      const auth = await authorizePlaybackAction('pause');
      if (!auth) return;

      const { roomCode, username } = auth;
      const room = await RoomModel.findOne({ roomCode });
      if (!room) {
        socket.emit(SOCKET_EVENTS.ERROR, { code: 'ROOM_NOT_FOUND', message: 'Room not found' });
        return;
      }

      // Determine authoritative paused time
      let targetTime: number;
      if (
        payload &&
        typeof payload.currentTime === 'number' &&
        Number.isFinite(payload.currentTime) &&
        !Number.isNaN(payload.currentTime) &&
        payload.currentTime >= 0
      ) {
        targetTime = Number(payload.currentTime.toFixed(2));
      } else {
        targetTime = syncService.calculateCurrentPlaybackTime(
          room.playbackState,
          room.playbackTime,
          room.lastUpdatedAt
        );
      }

      // Update authoritative room state in MongoDB
      room.playbackState = PlaybackState.PAUSED;
      room.playbackTime = targetTime;
      room.lastUpdatedAt = new Date();
      await room.save();

      // Broadcast to other members in room (omit sender to prevent duplicate actions / loops)
      socket.to(roomCode).emit(SOCKET_EVENTS.PAUSE, {
        currentTime: targetTime,
        serverTimestamp: Date.now(),
        triggeredBy: username,
      });

      logger.info(`[${roomCode}] PAUSE at ${targetTime}s by ${username} (${auth.role})`);
    } catch (err: any) {
      logger.error('Error handling pause socket event:', err);
      socket.emit(SOCKET_EVENTS.ERROR, {
        code: 'PAUSE_ERROR',
        message: 'Failed to process pause action',
      });
    }
  });

  // ==========================================================================
  // EVENT: seek
  // Payload: { time: number }
  // ==========================================================================
  socket.on(SOCKET_EVENTS.SEEK, async (payload: SeekPayload) => {
    try {
      const auth = await authorizePlaybackAction('seek');
      if (!auth) return;

      const { roomCode, username } = auth;

      // 5. Validate Payload (Handle negative time, NaN, Infinity, non-numbers)
      if (
        !payload ||
        typeof payload.time !== 'number' ||
        Number.isNaN(payload.time) ||
        !Number.isFinite(payload.time) ||
        payload.time < 0
      ) {
        socket.emit(SOCKET_EVENTS.ERROR, {
          code: 'INVALID_SEEK_TIME',
          message: 'Seek time must be a non-negative finite number',
        });
        return;
      }

      const targetTime = Number(payload.time.toFixed(2));
      const room = await RoomModel.findOne({ roomCode });
      if (!room) {
        socket.emit(SOCKET_EVENTS.ERROR, { code: 'ROOM_NOT_FOUND', message: 'Room not found' });
        return;
      }

      // Update authoritative room state in MongoDB
      room.playbackTime = targetTime;
      room.lastUpdatedAt = new Date();
      await room.save();

      // Broadcast to other members in room (omit sender to prevent duplicate actions / loops)
      socket.to(roomCode).emit(SOCKET_EVENTS.SEEK, {
        currentTime: targetTime,
        serverTimestamp: Date.now(),
        triggeredBy: username,
      });

      logger.info(`[${roomCode}] SEEK to ${targetTime}s by ${username} (${auth.role})`);
    } catch (err: any) {
      logger.error('Error handling seek socket event:', err);
      socket.emit(SOCKET_EVENTS.ERROR, {
        code: 'SEEK_ERROR',
        message: 'Failed to process seek action',
      });
    }
  });

  // ==========================================================================
  // EVENT: change_video
  // Payload: { videoId: string }
  // ==========================================================================
  socket.on(SOCKET_EVENTS.CHANGE_VIDEO, async (payload: ChangeVideoPayload) => {
    try {
      const auth = await authorizePlaybackAction('change_video');
      if (!auth) return;

      const { roomCode, username } = auth;

      // 5. Validate Payload (Handle invalid video IDs and malicious URLs)
      if (!payload || !payload.videoId || typeof payload.videoId !== 'string') {
        socket.emit(SOCKET_EVENTS.ERROR, {
          code: 'INVALID_VIDEO_ID',
          message: 'Video ID or URL is required',
        });
        return;
      }

      const extractedVideoId = extractYouTubeVideoId(payload.videoId);
      if (!extractedVideoId) {
        socket.emit(SOCKET_EVENTS.ERROR, {
          code: 'INVALID_VIDEO_ID',
          message: 'Invalid YouTube video ID or URL format (must resolve to 11 characters)',
        });
        return;
      }

      const room = await RoomModel.findOne({ roomCode });
      if (!room) {
        socket.emit(SOCKET_EVENTS.ERROR, { code: 'ROOM_NOT_FOUND', message: 'Room not found' });
        return;
      }

      // Update authoritative room state in MongoDB:
      // Reset playhead to 0 and paused status on new video load
      room.currentVideoId = extractedVideoId;
      room.playbackState = PlaybackState.PAUSED;
      room.playbackTime = 0;
      room.lastUpdatedAt = new Date();
      await room.save();

      // Broadcast change_video to all room members (including sender so UI resets)
      io.to(roomCode).emit(SOCKET_EVENTS.CHANGE_VIDEO, {
        videoId: extractedVideoId,
        playState: PlaybackState.PAUSED,
        currentTime: 0,
        serverTimestamp: Date.now(),
        triggeredBy: username,
      });

      logger.info(
        `[${roomCode}] CHANGE_VIDEO to ${extractedVideoId} by ${username} (${auth.role})`
      );
    } catch (err: any) {
      logger.error('Error handling change_video socket event:', err);
      socket.emit(SOCKET_EVENTS.ERROR, {
        code: 'CHANGE_VIDEO_ERROR',
        message: 'Failed to process change_video action',
      });
    }
  });
}
