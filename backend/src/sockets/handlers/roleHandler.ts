import { Server as SocketIOServer, Socket } from 'socket.io';
import { roomService } from '../../services/roomService';
import { AssignRolePayload, RemoveParticipantPayload, SOCKET_EVENTS } from '../../types/socket.types';
import { logger } from '../../utils/logger';

export function registerRoleHandlers(io: SocketIOServer, socket: Socket): void {
  // 1. Assign Role (Promote / Demote)
  socket.on(SOCKET_EVENTS.ASSIGN_ROLE, async (payload: AssignRolePayload) => {
    try {
      const { roomCode, targetUserId, newRole } = payload;
      const { updatedBy } = await roomService.assignRole(roomCode, socket.id, targetUserId, newRole);

      const code = roomCode.trim().toUpperCase();
      io.to(code).emit(SOCKET_EVENTS.ROLE_ASSIGNED, {
        targetUserId,
        newRole,
        updatedBy,
      });
      logger.info(`[${code}] Role of user '${targetUserId}' changed to ${newRole} by ${updatedBy}`);
    } catch (err: any) {
      socket.emit(SOCKET_EVENTS.ERROR, {
        code: err.errorCode || 'ASSIGN_ROLE_ERROR',
        message: err.message || 'Failed to assign role',
      });
    }
  });

  // 2. Remove Participant (Kick)
  socket.on(SOCKET_EVENTS.REMOVE_PARTICIPANT, async (payload: RemoveParticipantPayload) => {
    try {
      const { roomCode, targetUserId } = payload;
      const { targetSocketId, removedBy } = await roomService.removeParticipant(
        roomCode,
        socket.id,
        targetUserId
      );

      const code = roomCode.trim().toUpperCase();

      // Notify the removed user specifically
      if (targetSocketId) {
        const targetSocket = io.sockets.sockets.get(targetSocketId);
        if (targetSocket) {
          targetSocket.emit(SOCKET_EVENTS.PARTICIPANT_REMOVED, {
            targetUserId,
            reason: `You were removed from the room by ${removedBy}`,
          });
          await targetSocket.leave(code);
        }
      }

      // Broadcast to remaining room members
      io.to(code).emit(SOCKET_EVENTS.PARTICIPANT_REMOVED, {
        targetUserId,
        removedBy,
      });
      logger.info(`[${code}] Participant '${targetUserId}' removed from room by ${removedBy}`);
    } catch (err: any) {
      socket.emit(SOCKET_EVENTS.ERROR, {
        code: err.errorCode || 'REMOVE_PARTICIPANT_ERROR',
        message: err.message || 'Failed to remove participant',
      });
    }
  });
}
