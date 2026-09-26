import { Server as SocketIOServer, Socket } from 'socket.io';
import { roomService } from '../../services/roomService';
import { PlaybackStatus } from '../../types/room.types';
import {
  ChangeVideoPayload,
  PlaybackControlPayload,
  SeekPayload,
  SyncStateRequestPayload,
  SOCKET_EVENTS,
} from '../../types/socket.types';
import { logger } from '../../utils/logger';

export function registerSyncHandlers(io: SocketIOServer, socket: Socket): void {
  // 1. Play Event
  socket.on(SOCKET_EVENTS.PLAY, async (payload: PlaybackControlPayload) => {
    try {
      const { roomCode, currentTime } = payload;
      const { triggeredBy } = await roomService.updatePlayback(
        roomCode,
        socket.id,
        PlaybackStatus.PLAYING,
        currentTime
      );

      const code = roomCode.trim().toUpperCase();
      // Broadcast to all other peers in room
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
      const { triggeredBy } = await roomService.updatePlayback(
        roomCode,
        socket.id,
        PlaybackStatus.PAUSED,
        currentTime
      );

      const code = roomCode.trim().toUpperCase();
      // Broadcast to all other peers in room
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
      const { triggeredBy } = await roomService.seekPlayback(roomCode, socket.id, targetTime);

      const code = roomCode.trim().toUpperCase();
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
      const { video, triggeredBy } = await roomService.changeVideo(roomCode, socket.id, videoUrlOrId);

      const code = roomCode.trim().toUpperCase();
      // Broadcast to entire room including sender so everyone switches to the new video
      io.to(code).emit(SOCKET_EVENTS.CHANGE_VIDEO, {
        video,
        status: PlaybackStatus.PAUSED,
        currentTime: 0,
        serverTimestamp: Date.now(),
        triggeredBy,
      });
      logger.info(`[${code}] CHANGE_VIDEO to ${video.videoId} by ${triggeredBy}`);
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
      const room = await roomService.getRoomByCode(roomCode);
      const requester = room.participants.find((p) => p.socketId === socket.id);

      socket.emit(SOCKET_EVENTS.SYNC_STATE, {
        video: room.video,
        playback: {
          ...room.playback,
          serverTimestamp: Date.now(),
        },
        participants: room.participants,
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
