import { Server as SocketIOServer } from 'socket.io';
import {
  addRuntimeParticipant,
  broadcastParticipants,
  checkRole,
  getOnlineParticipantsInRoom,
  getParticipant,
  getRoom,
  isUserOnlineInRoom,
  removeRuntimeParticipant,
} from '../roomSocket';
import { roomService } from '../../services/roomService';
import {
  CustomSocket,
  JoinRoomPayload,
  LeaveRoomPayload,
  SOCKET_EVENTS,
} from '../socketTypes';
import { SafeParticipantDto } from '../../types/room.types';
import { logger } from '../../utils/logger';

export function registerRoomHandlers(io: SocketIOServer, socket: CustomSocket): void {
  /**
   * Handle socket joining a watch party room.
   *
   * Flow:
   * 1. Validate payload/session input
   * 2. Verify room exists in persistent storage (MongoDB)
   * 3. Verify / register persistent participant
   * 4. Determine actual role strictly from server-side data
   * 5. Join Socket.IO room & track in runtime memory
   * 6. Send current room state to joining socket
   * 7. Broadcast participant update to room
   */
  socket.on(SOCKET_EVENTS.JOIN_ROOM, async (payload: JoinRoomPayload) => {
    try {
      // 1. Validate session / input data
      if (!payload || typeof payload !== 'object') {
        socket.emit(SOCKET_EVENTS.ERROR, {
          code: 'INVALID_PAYLOAD',
          message: 'Malformed request payload',
        });
        return;
      }

      const roomCode = payload.roomCode?.trim().toUpperCase();
      const userId = payload.userId?.trim();
      const rawUsername = payload.username?.trim();

      if (!roomCode || !userId) {
        socket.emit(SOCKET_EVENTS.ERROR, {
          code: 'MISSING_CREDENTIALS',
          message: 'Both roomCode and userId are required to join room',
        });
        return;
      }

      // 2. Verify room exists in MongoDB
      const room = await getRoom(roomCode);

      // 3. Verify participant in persistent storage (or register if new)
      let persistentParticipant = await getParticipant(roomCode, userId);
      const username = rawUsername || persistentParticipant?.username || 'Guest';

      if (!persistentParticipant) {
        // Register in persistent MongoDB room
        const joinResult = await roomService.joinRoom(roomCode, userId, username);
        persistentParticipant = {
          userId: joinResult.participant.userId,
          username: joinResult.participant.username,
          role: joinResult.participant.role,
          joinedAt: joinResult.participant.joinedAt,
        };
      }

      // 4. Determine actual role from server-side data (Never trust client-provided role!)
      const resolvedRole = await checkRole(roomCode, userId);

      // 5. Join Socket.IO room channel & store in runtime memory
      await socket.join(roomCode);

      const runtimeParticipant = {
        socketId: socket.id,
        userId,
        username,
        role: resolvedRole,
        roomCode,
        connectedAt: new Date(),
      };

      addRuntimeParticipant(runtimeParticipant);

      // Attach verified session data to socket instance for fast subsequent lookups
      socket.data.session = {
        userId,
        username,
        role: resolvedRole,
        roomCode,
      };

      logger.info(
        `Socket connected to room: [room=${roomCode}, user=${username}, role=${resolvedRole}, socketId=${socket.id}]`
      );

      // 6. Send current authoritative room state directly to the joining socket
      socket.emit(SOCKET_EVENTS.SYNC_STATE, {
        roomCode: room.roomCode,
        currentVideoId: room.currentVideoId,
        playbackState: room.playbackState,
        playbackTime: room.playbackTime,
        serverTimestamp: Date.now(),
        userRole: resolvedRole,
        participants: room.participants,
        participantCount: getOnlineParticipantsInRoom(roomCode).length,
      });

      // 7. Broadcast participant update to other members of the room
      const safeUserDto: SafeParticipantDto = {
        userId,
        username,
        role: resolvedRole,
        joinedAt: persistentParticipant.joinedAt,
        isOnline: true,
      };

      socket.to(roomCode).emit(SOCKET_EVENTS.USER_JOINED, {
        user: safeUserDto,
        participantCount: getOnlineParticipantsInRoom(roomCode).length,
      });

      // Broadcast full refreshed participant list to room
      await broadcastParticipants(io, roomCode);
    } catch (err: any) {
      logger.error('Error in join_room socket handler:', err);
      socket.emit(SOCKET_EVENTS.ERROR, {
        code: err.errorCode || 'JOIN_ROOM_FAILED',
        message: err.message || 'Failed to join watch party room',
      });
    }
  });

  /**
   * Handle socket leaving a room explicitly
   */
  socket.on(SOCKET_EVENTS.LEAVE_ROOM, async (payload: LeaveRoomPayload) => {
    try {
      const roomCode = payload?.roomCode?.trim().toUpperCase() || socket.data.session?.roomCode;
      if (!roomCode) return;

      const removed = removeRuntimeParticipant(socket.id);
      await socket.leave(roomCode);
      delete socket.data.session;

      if (removed) {
        const stillOnline = isUserOnlineInRoom(roomCode, removed.userId);
        if (!stillOnline) {
          io.to(roomCode).emit(SOCKET_EVENTS.USER_LEFT, {
            userId: removed.userId,
            username: removed.username,
            participantCount: getOnlineParticipantsInRoom(roomCode).length,
          });
        }
        await broadcastParticipants(io, roomCode);
      }
    } catch (err) {
      logger.error('Error in leave_room socket handler:', err);
    }
  });

  /**
   * Handle socket disconnection (network drop, tab close, navigation)
   */
  socket.on('disconnect', async (reason: string) => {
    try {
      const removed = removeRuntimeParticipant(socket.id);
      if (!removed) return;

      const { roomCode, userId, username } = removed;
      logger.info(
        `Socket disconnected: [room=${roomCode}, user=${username}, socketId=${socket.id}, reason=${reason}]`
      );

      // Check if user has no remaining open connections (e.g. closed all tabs)
      const stillOnline = isUserOnlineInRoom(roomCode, userId);
      if (!stillOnline) {
        io.to(roomCode).emit(SOCKET_EVENTS.USER_LEFT, {
          userId,
          username,
          participantCount: getOnlineParticipantsInRoom(roomCode).length,
        });
      }

      await broadcastParticipants(io, roomCode);
    } catch (err) {
      logger.error('Error handling socket disconnect:', err);
    }
  });
}
