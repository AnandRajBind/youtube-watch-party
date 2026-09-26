import crypto from 'crypto';
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
   * Event: join_room
   *
   * Payload: { roomId (or roomCode), username, userId? }
   *
   * 8-step server-authoritative join process:
   * 1. Validate room
   * 2. Validate participant/session
   * 3. Determine actual participant identity
   * 4. Determine role from server-side state (Never trust client-provided role!)
   * 5. Join Socket.IO room & track runtime connection (handle duplicates gracefully)
   * 6. Send sync_state { playState, currentTime, videoId, ... } to joining client
   * 7. Broadcast user_joined to other clients in room
   * 8. Broadcast updated participant list to room
   */
  socket.on(SOCKET_EVENTS.JOIN_ROOM, async (payload: JoinRoomPayload) => {
    try {
      if (!payload || typeof payload !== 'object') {
        socket.emit(SOCKET_EVENTS.ERROR, {
          code: 'INVALID_PAYLOAD',
          message: 'Request payload must be an object',
        });
        return;
      }

      // 1. Validate Room
      const rawRoomId = payload.roomId || payload.roomCode;
      const roomId = rawRoomId?.trim().toUpperCase();

      if (!roomId) {
        socket.emit(SOCKET_EVENTS.ERROR, {
          code: 'MISSING_ROOM_ID',
          message: 'roomId is required to join room',
        });
        return;
      }

      // Verify room exists in persistent storage (MongoDB)
      const room = await getRoom(roomId);

      // 2. Validate Participant / Session
      const rawUsername = payload.username?.trim();
      const sanitizedUsername = rawUsername ? rawUsername.replace(/<[^>]*>?/gm, '') : '';

      if (!sanitizedUsername || sanitizedUsername.length < 2) {
        socket.emit(SOCKET_EVENTS.ERROR, {
          code: 'INVALID_USERNAME',
          message: 'Username must be at least 2 characters long',
        });
        return;
      }

      // 3. Determine actual participant identity
      // Look for userId from socket handshake auth, payload, or generate new identity
      const handshakeUserId = (socket.handshake.auth?.userId as string)?.trim();
      const payloadUserId = payload.userId?.trim();
      const clientUserId = handshakeUserId || payloadUserId;

      let persistentParticipant = clientUserId
        ? await getParticipant(roomId, clientUserId)
        : null;

      let userId = persistentParticipant ? persistentParticipant.userId : clientUserId;

      if (!userId) {
        userId = crypto.randomUUID();
      }

      // If participant not yet in persistent room record, persist them
      if (!persistentParticipant) {
        const joinResult = await roomService.joinRoom(roomId, userId, sanitizedUsername);
        persistentParticipant = {
          userId: joinResult.participant.userId,
          username: joinResult.participant.username,
          role: joinResult.participant.role,
          joinedAt: joinResult.participant.joinedAt,
        };
      }

      const finalUsername = sanitizedUsername || persistentParticipant.username;

      // 4. Determine role from server-side state
      // CRITICAL: NEVER trust any role sent by client
      const resolvedRole = await checkRole(roomId, userId);

      // 5. Join Socket.IO room & handle duplicate connections gracefully
      // Clean up any previous room this socket was in
      if (socket.data.session && socket.data.session.roomCode !== roomId) {
        await socket.leave(socket.data.session.roomCode);
        removeRuntimeParticipant(socket.id);
      }

      const isAlreadyConnectedInRoom = isUserOnlineInRoom(roomId, userId);

      // Add socket connection to in-memory runtime store
      addRuntimeParticipant({
        socketId: socket.id,
        userId,
        username: finalUsername,
        role: resolvedRole,
        roomCode: roomId,
        connectedAt: new Date(),
      });

      // Cache session on socket instance
      socket.data.session = {
        userId,
        username: finalUsername,
        role: resolvedRole,
        roomCode: roomId,
      };

      await socket.join(roomId);

      logger.info(
        `Participant joined room: [roomId=${roomId}, user=${finalUsername}, role=${resolvedRole}, socketId=${socket.id}, duplicateTab=${isAlreadyConnectedInRoom}]`
      );

      // 6. Send sync_state directly to the joining client
      // Exact requested structure: { playState, currentTime, videoId, ... }
      socket.emit(SOCKET_EVENTS.SYNC_STATE, {
        playState: room.playbackState,
        currentTime: room.playbackTime,
        videoId: room.currentVideoId,
        roomCode: room.roomCode,
        roomId: room.roomCode,
        userRole: resolvedRole,
        serverTimestamp: Date.now(),
        participants: room.participants,
      });

      // 7. Broadcast user_joined to other clients (only if first connection for this user)
      const safeUserDto: SafeParticipantDto = {
        userId,
        username: finalUsername,
        role: resolvedRole,
        joinedAt: persistentParticipant.joinedAt,
        isOnline: true,
      };

      if (!isAlreadyConnectedInRoom) {
        socket.to(roomId).emit(SOCKET_EVENTS.USER_JOINED, {
          user: safeUserDto,
          participantCount: getOnlineParticipantsInRoom(roomId).length,
          roomCode: roomId,
          roomId,
        });
      }

      // 8. Broadcast updated participant list to all room members
      await broadcastParticipants(io, roomId);
    } catch (err: any) {
      logger.error('Error in join_room socket handler:', err);
      socket.emit(SOCKET_EVENTS.ERROR, {
        code: err.errorCode || 'JOIN_ROOM_FAILED',
        message: err.message || 'Failed to join room',
      });
    }
  });

  /**
   * Event: leave_room
   *
   * 1. Remove participant from active room runtime memory
   * 2. Broadcast user_left
   * 3. Clean runtime socket state
   * 4. Leave Socket.IO room
   */
  socket.on(SOCKET_EVENTS.LEAVE_ROOM, async (payload: LeaveRoomPayload) => {
    try {
      const rawRoomId = payload?.roomId || payload?.roomCode || socket.data.session?.roomCode;
      const roomId = rawRoomId?.trim().toUpperCase();

      if (!roomId) return;

      const removed = removeRuntimeParticipant(socket.id);
      await socket.leave(roomId);
      delete socket.data.session;

      if (removed) {
        // Only broadcast user_left if user has no remaining active connections in this room
        const stillOnline = isUserOnlineInRoom(roomId, removed.userId);
        if (!stillOnline) {
          io.to(roomId).emit(SOCKET_EVENTS.USER_LEFT, {
            userId: removed.userId,
            username: removed.username,
            participantCount: getOnlineParticipantsInRoom(roomId).length,
            roomCode: roomId,
            roomId,
          });
        }
        await broadcastParticipants(io, roomId);
      }
    } catch (err) {
      logger.error('Error in leave_room socket handler:', err);
    }
  });

  /**
   * Event: sync_state (Client manual refresh / state query)
   */
  socket.on(SOCKET_EVENTS.SYNC_STATE, async () => {
    try {
      const session = socket.data.session;
      if (!session) return;

      const room = await getRoom(session.roomCode);
      socket.emit(SOCKET_EVENTS.SYNC_STATE, {
        playState: room.playbackState,
        currentTime: room.playbackTime,
        videoId: room.currentVideoId,
        roomCode: room.roomCode,
        roomId: room.roomCode,
        userRole: session.role,
        serverTimestamp: Date.now(),
        participants: room.participants,
      });
    } catch (err) {
      logger.error('Error in sync_state request handler:', err);
    }
  });

  /**
   * Event: disconnect
   *
   * Cleans runtime socket state safely.
   * If user has no remaining open connections (tabs), broadcasts user_left.
   */
  socket.on('disconnect', async (reason: string) => {
    try {
      const removed = removeRuntimeParticipant(socket.id);
      if (!removed) return;

      const { roomCode, userId, username } = removed;
      logger.info(
        `Socket disconnected: [roomId=${roomCode}, user=${username}, socketId=${socket.id}, reason=${reason}]`
      );

      // Check if user has other open connections (e.g. multiple tabs)
      const stillOnline = isUserOnlineInRoom(roomCode, userId);
      if (!stillOnline) {
        io.to(roomCode).emit(SOCKET_EVENTS.USER_LEFT, {
          userId,
          username,
          participantCount: getOnlineParticipantsInRoom(roomCode).length,
          roomCode,
          roomId: roomCode,
        });
      }

      await broadcastParticipants(io, roomCode);
    } catch (err) {
      logger.error('Error handling socket disconnect:', err);
    }
  });
}
