import { Server as SocketIOServer, Socket } from 'socket.io';
import { roomService } from '../../services/roomService';
import { connectionManager } from '../connectionManager';
import { IParticipantPresence } from '../../types/room.types';
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

      // MongoDB persistent update
      const { room, participant } = await roomService.joinRoom(roomCode, userId, username);
      const code = room.roomCode;

      // In-memory volatile connection tracking
      connectionManager.addConnection(socket.id, userId, code);
      await socket.join(code);

      logger.info(`User '${username}' (${userId}) joined room ${code} [socketId=${socket.id}]`);

      // Combine persistent data with in-memory presence
      const participantsWithPresence: IParticipantPresence[] = room.participants.map((p) => ({
        ...p,
        isOnline: connectionManager.isUserOnline(p.userId, code),
      }));

      const userPresence: IParticipantPresence = {
        ...participant,
        isOnline: true,
      };

      // Send initial authoritative sync state back to joining socket
      socket.emit(SOCKET_EVENTS.SYNC_STATE, {
        currentVideoId: room.currentVideoId,
        playbackState: room.playbackState,
        playbackTime: room.playbackTime,
        serverTimestamp: Date.now(),
        participants: participantsWithPresence,
        userRole: participant.role,
      });

      // Broadcast user_joined to other participants in the room
      socket.to(code).emit(SOCKET_EVENTS.USER_JOINED, {
        user: userPresence,
        participantCount: connectionManager.getOnlineUserIds(code).length,
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
      const { roomCode, userId } = payload;
      const code = roomCode?.trim().toUpperCase();
      connectionManager.removeConnection(socket.id);

      if (code) {
        await socket.leave(code);
        io.to(code).emit(SOCKET_EVENTS.USER_LEFT, {
          userId,
          username: 'User',
          participantCount: connectionManager.getOnlineUserIds(code).length,
        });
      }
    } catch (err: any) {
      logger.error('Error in leave_room handler:', err);
    }
  });

  // 3. Socket Disconnect
  socket.on('disconnect', async (reason) => {
    try {
      const conn = connectionManager.removeConnection(socket.id);
      if (conn) {
        const { userId, roomCode } = conn;
        // Check if user has no remaining active connections (tabs) in this room
        const isStillOnline = connectionManager.isUserOnline(userId, roomCode);
        if (!isStillOnline) {
          logger.info(`Participant '${userId}' went offline in ${roomCode} (${reason})`);
          io.to(roomCode).emit(SOCKET_EVENTS.USER_LEFT, {
            userId,
            username: 'User',
            participantCount: connectionManager.getOnlineUserIds(roomCode).length,
          });
        }
      }
    } catch (err) {
      logger.error('Error handling socket disconnect:', err);
    }
  });
}
