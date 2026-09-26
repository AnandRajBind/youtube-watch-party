import { Server as SocketIOServer, Socket } from 'socket.io';
import { roomService } from '../../services/roomService';
import { JoinRoomPayload, LeaveRoomPayload, SOCKET_EVENTS } from '../../types/socket.types';
import { logger } from '../../utils/logger';

export function registerRoomHandlers(io: SocketIOServer, socket: Socket): void {
  // 1. Join Room
  socket.on(SOCKET_EVENTS.JOIN_ROOM, async (payload: JoinRoomPayload) => {
    try {
      const { roomCode, userId, username } = payload;
      if (!roomCode || !userId || !username) {
        socket.emit(SOCKET_EVENTS.ERROR, {
          code: 'INVALID_PAYLOAD',
          message: 'roomCode, userId, and username are required to join room',
        });
        return;
      }

      const { room, participant } = await roomService.joinRoom(roomCode, userId, username, socket.id);
      const code = room.roomCode;

      // Join Socket.IO room channel
      await socket.join(code);
      logger.info(`User '${username}' (${userId}) joined room ${code} [socketId=${socket.id}]`);

      // Send initial authoritative sync state back to joining socket
      socket.emit(SOCKET_EVENTS.SYNC_STATE, {
        video: room.video,
        playback: {
          ...room.playback,
          serverTimestamp: Date.now(),
        },
        participants: room.participants,
        userRole: participant.role,
      });

      // Broadcast user_joined to other participants in the room
      socket.to(code).emit(SOCKET_EVENTS.USER_JOINED, {
        user: participant,
        participantCount: room.participants.filter((p) => p.isOnline).length,
      });
    } catch (err: any) {
      logger.error('Error in join_room handler:', err);
      socket.emit(SOCKET_EVENTS.ERROR, {
        code: err.errorCode || 'JOIN_ROOM_ERROR',
        message: err.message || 'Failed to join room',
      });
    }
  });

  // 2. Explicit Leave Room
  socket.on(SOCKET_EVENTS.LEAVE_ROOM, async (payload: LeaveRoomPayload) => {
    try {
      const { roomCode } = payload;
      const result = await roomService.leaveRoom(socket.id);
      if (roomCode) {
        await socket.leave(roomCode.trim().toUpperCase());
      }

      if (result) {
        const { room, leftUser } = result;
        io.to(room.roomCode).emit(SOCKET_EVENTS.USER_LEFT, {
          userId: leftUser.userId,
          username: leftUser.username,
          participantCount: room.participants.filter((p) => p.isOnline).length,
        });
      }
    } catch (err: any) {
      logger.error('Error in leave_room handler:', err);
    }
  });

  // 3. Socket Disconnect
  socket.on('disconnect', async (reason) => {
    try {
      const result = await roomService.leaveRoom(socket.id);
      if (result) {
        const { room, leftUser } = result;
        logger.info(`Participant '${leftUser.username}' disconnected from ${room.roomCode} (${reason})`);

        io.to(room.roomCode).emit(SOCKET_EVENTS.USER_LEFT, {
          userId: leftUser.userId,
          username: leftUser.username,
          participantCount: room.participants.filter((p) => p.isOnline).length,
        });
      }
    } catch (err) {
      logger.error('Error handling socket disconnect:', err);
    }
  });
}
