import { Server as SocketIOServer, Socket } from 'socket.io';
import { roomService } from '../../services/roomService';
import { connectionManager } from '../connectionManager';
import { IParticipantPresence, PlaybackState } from '../../types/room.types';
import {
  ChangeVideoPayload,
  PlaybackControlPayload,
  SeekPayload,
  SyncStateRequestPayload,
  SOCKET_EVENTS,
} from '../../types/socket.types';
import { logger } from '../../utils/logger';

export function registerSyncHandlers(io: SocketIOServer, socket: Socket): void {
  // Helper to get connected userId
  function getRequesterUserId(roomCode: string): string | null {
    // Look up in connectionManager
    for (const [sId, conn] of (connectionManager as any).socketToConnection.entries()) {
      if (sId === socket.id && conn.roomCode === roomCode.trim().toUpperCase()) {
        return conn.userId;
      }
    }
    return null;
  }

  // 1. Play Event
  socket.on(SOCKET_EVENTS.PLAY, async (payload: PlaybackControlPayload) => {
    try {
      const { roomCode, currentTime } = payload;
      const code = roomCode.trim().toUpperCase();
      const userId = getRequesterUserId(code);
      if (!userId) {
        socket.emit(SOCKET_EVENTS.ERROR, { code: 'UNAUTHORIZED', message: 'You must join the room first' });
        return;
      }

      const { triggeredBy } = await roomService.updatePlayback(
        code,
        userId,
        PlaybackState.PLAYING,
        currentTime
      );

      // Broadcast to all other peers in room (omit sender)
      socket.to(code).emit(SOCKET_EVENTS.PLAY, {
        currentTime,
        serverTimestamp: Date.now(),
        triggeredBy,
      });
      logger.info(`[${code}] PLAY emitted at ${currentTime}s by ${triggeredBy}`);
    } catch (err: any) {
      socket.emit(SOCKET_EVENTS.ERROR, {
        code: err.errorCode || 'PLAY_ERROR',
        message: err.message || 'Failed to play video',
      });
    }
  });

  // 2. Pause Event
  socket.on(SOCKET_EVENTS.PAUSE, async (payload: PlaybackControlPayload) => {
    try {
      const { roomCode, currentTime } = payload;
      const code = roomCode.trim().toUpperCase();
      const userId = getRequesterUserId(code);
      if (!userId) {
        socket.emit(SOCKET_EVENTS.ERROR, { code: 'UNAUTHORIZED', message: 'You must join the room first' });
        return;
      }

      const { triggeredBy } = await roomService.updatePlayback(
        code,
        userId,
        PlaybackState.PAUSED,
        currentTime
      );

      // Broadcast to all other peers in room (omit sender)
      socket.to(code).emit(SOCKET_EVENTS.PAUSE, {
        currentTime,
        serverTimestamp: Date.now(),
        triggeredBy,
      });
      logger.info(`[${code}] PAUSE emitted at ${currentTime}s by ${triggeredBy}`);
    } catch (err: any) {
      socket.emit(SOCKET_EVENTS.ERROR, {
        code: err.errorCode || 'PAUSE_ERROR',
        message: err.message || 'Failed to pause video',
      });
    }
  });

  // 3. Seek Event
  socket.on(SOCKET_EVENTS.SEEK, async (payload: SeekPayload) => {
    try {
      const { roomCode, targetTime } = payload;
      const code = roomCode.trim().toUpperCase();
      const userId = getRequesterUserId(code);
      if (!userId) {
        socket.emit(SOCKET_EVENTS.ERROR, { code: 'UNAUTHORIZED', message: 'You must join the room first' });
        return;
      }

      const { triggeredBy } = await roomService.seekPlayback(code, userId, targetTime);

      socket.to(code).emit(SOCKET_EVENTS.SEEK, {
        targetTime,
        serverTimestamp: Date.now(),
        triggeredBy,
      });
      logger.info(`[${code}] SEEK emitted to ${targetTime}s by ${triggeredBy}`);
    } catch (err: any) {
      socket.emit(SOCKET_EVENTS.ERROR, {
        code: err.errorCode || 'SEEK_ERROR',
        message: err.message || 'Failed to seek video',
      });
    }
  });

  // 4. Change Video Event
  socket.on(SOCKET_EVENTS.CHANGE_VIDEO, async (payload: ChangeVideoPayload) => {
    try {
      const { roomCode, videoUrlOrId } = payload;
      const code = roomCode.trim().toUpperCase();
      const userId = getRequesterUserId(code);
      if (!userId) {
        socket.emit(SOCKET_EVENTS.ERROR, { code: 'UNAUTHORIZED', message: 'You must join the room first' });
        return;
      }

      const { currentVideoId, triggeredBy } = await roomService.changeVideo(code, userId, videoUrlOrId);

      // Broadcast to entire room including sender
      io.to(code).emit(SOCKET_EVENTS.CHANGE_VIDEO, {
        videoId: currentVideoId,
        playbackState: PlaybackState.PAUSED,
        playbackTime: 0,
        serverTimestamp: Date.now(),
        triggeredBy,
      });
      logger.info(`[${code}] CHANGE_VIDEO to ${currentVideoId} by ${triggeredBy}`);
    } catch (err: any) {
      socket.emit(SOCKET_EVENTS.ERROR, {
        code: err.errorCode || 'CHANGE_VIDEO_ERROR',
        message: err.message || 'Failed to change video',
      });
    }
  });

  // 5. Explicit Sync State Request
  socket.on(SOCKET_EVENTS.SYNC_STATE, async (payload: SyncStateRequestPayload) => {
    try {
      const { roomCode } = payload;
      const code = roomCode.trim().toUpperCase();
      const room = await roomService.getRoomByCode(code);
      const userId = getRequesterUserId(code);
      const requester = room.participants.find((p) => p.userId === userId);

      const participantsWithPresence: IParticipantPresence[] = room.participants.map((p) => ({
        ...p,
        isOnline: connectionManager.isUserOnline(p.userId, code),
      }));

      socket.emit(SOCKET_EVENTS.SYNC_STATE, {
        currentVideoId: room.currentVideoId,
        playbackState: room.playbackState,
        playbackTime: room.currentCalculatedTime,
        serverTimestamp: Date.now(),
        participants: participantsWithPresence,
        userRole: requester?.role,
      });
    } catch (err: any) {
      socket.emit(SOCKET_EVENTS.ERROR, {
        code: err.errorCode || 'SYNC_ERROR',
        message: err.message || 'Failed to sync state',
      });
    }
  });
}
