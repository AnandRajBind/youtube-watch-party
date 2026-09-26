import { Server as SocketIOServer } from 'socket.io';
import {
  broadcastParticipants,
  checkRole,
  getParticipant,
  getRuntimeParticipant,
  getSocketIdsForUser,
  removeRuntimeParticipant,
  updateParticipantRoleInRuntime,
} from '../roomSocket';
import { roomService } from '../../services/roomService';
import {
  canManageRoles,
  canRemoveParticipant,
  canTransferHost,
} from '../../services/permissionService';
import { Role } from '../../types/room.types';
import {
  AssignRolePayload,
  CustomSocket,
  RemoveParticipantPayload,
  SOCKET_EVENTS,
  TransferHostPayload,
} from '../socketTypes';
import { logger } from '../../utils/logger';

interface AuthorizedHostContext {
  roomCode: string;
  userId: string;
  username: string;
  role: Role;
}

export function registerRoleHandlers(io: SocketIOServer, socket: CustomSocket): void {
  /**
   * Internal Helper: Verifies that the emitting socket belongs to the room
   * and holds server-verified Host privileges.
   */
  async function authorizeHostAction(eventName: string): Promise<AuthorizedHostContext | null> {
    const session = socket.data.session || getRuntimeParticipant(socket.id);
    if (!session || !session.roomCode || !session.userId) {
      socket.emit(SOCKET_EVENTS.ERROR, {
        code: 'UNAUTHORIZED',
        message: `Authentication required to perform '${eventName}'`,
      });
      return null;
    }

    const { roomCode, userId } = session;

    // Verify participant belongs to room
    const persistentParticipant = await getParticipant(roomCode, userId);
    if (!persistentParticipant) {
      socket.emit(SOCKET_EVENTS.ERROR, {
        code: 'NOT_A_MEMBER',
        message: 'You are not a member of this room',
      });
      return null;
    }

    // Determine actual role strictly from server-side state (MongoDB)
    const actualRole = await checkRole(roomCode, userId);

    return {
      roomCode,
      userId,
      username: persistentParticipant.username,
      role: actualRole,
    };
  }

  // ==========================================================================
  // EVENT: assign_role
  // Payload: { userId: string, role: 'moderator' | 'participant' }
  // Only Host can promote or demote members.
  // ==========================================================================
  socket.on(SOCKET_EVENTS.ASSIGN_ROLE, async (payload: AssignRolePayload) => {
    try {
      const auth = await authorizeHostAction('assign_role');
      if (!auth) return;

      const { roomCode, userId: requesterUserId, username: requesterUsername, role: requesterRole } = auth;

      // 1. Centralized permission check: Only Host can assign roles
      if (!canManageRoles(requesterRole)) {
        logger.warn(
          `Unauthorized role assignment attempt: [user=${requesterUsername}, role=${requesterRole}, room=${roomCode}]`
        );
        socket.emit(SOCKET_EVENTS.ERROR, {
          code: 'FORBIDDEN_ROLE_MANAGEMENT',
          message: 'Permission denied: Only the Host can assign or change participant roles',
        });
        return;
      }

      // 2. Validate payload presence
      const targetUserId = (payload?.userId || payload?.targetUserId)?.trim();
      const rawRole = (payload?.role || payload?.newRole)?.trim()?.toLowerCase();

      if (!targetUserId || !rawRole) {
        socket.emit(SOCKET_EVENTS.ERROR, {
          code: 'INVALID_PAYLOAD',
          message: 'userId and role are required to assign a role',
        });
        return;
      }

      // 3. Reject attempt to assign host through this event (prevent multiple hosts / self-host upgrade)
      if (rawRole === Role.HOST || rawRole === 'host') {
        socket.emit(SOCKET_EVENTS.ERROR, {
          code: 'CANNOT_ASSIGN_HOST_ROLE',
          message: 'Cannot assign host role through assign_role. Multiple hosts are not permitted. Use transfer_host to change room ownership.',
        });
        return;
      }

      // 4. Reject invalid role (must be moderator or participant)
      if (rawRole !== Role.MODERATOR && rawRole !== Role.PARTICIPANT) {
        socket.emit(SOCKET_EVENTS.ERROR, {
          code: 'INVALID_ROLE',
          message: "Invalid role: Role must be either 'moderator' or 'participant'",
        });
        return;
      }

      // 5. Verify target user exists in the same room (reject unknown user / user outside room)
      const targetParticipant = await getParticipant(roomCode, targetUserId);
      if (!targetParticipant) {
        socket.emit(SOCKET_EVENTS.ERROR, {
          code: 'USER_NOT_FOUND',
          message: 'Target user does not exist in this room',
        });
        return;
      }

      // 6. Host role must remain protected: cannot alter host's role via assign_role
      if (targetParticipant.role === Role.HOST) {
        socket.emit(SOCKET_EVENTS.ERROR, {
          code: 'PROTECTED_HOST_ROLE',
          message: 'Cannot alter the role of the room Host. The host role is protected.',
        });
        return;
      }

      const targetRole = rawRole as Role.MODERATOR | Role.PARTICIPANT;

      // 7. Persist role update in MongoDB
      const result = await roomService.assignRole(roomCode, requesterUserId, targetUserId, targetRole);

      // 8. Update server-side runtime memory presence for target user
      updateParticipantRoleInRuntime(roomCode, targetUserId, targetRole);

      // 9. Update target socket session data if currently connected
      const targetSockets = getSocketIdsForUser(roomCode, targetUserId);
      for (const targetSocketId of targetSockets) {
        const targetSocket = io.sockets.sockets.get(targetSocketId) as CustomSocket | undefined;
        if (targetSocket && targetSocket.data.session) {
          targetSocket.data.session.role = targetRole;
        }
      }

      // 10. Broadcast role_assigned to all members in the room
      io.to(roomCode).emit(SOCKET_EVENTS.ROLE_ASSIGNED, {
        userId: result.userId,
        role: result.role,
        targetUserId: result.targetUserId,
        newRole: result.newRole,
        updatedBy: requesterUsername,
      });

      // 11. Broadcast updated participant list to room
      await broadcastParticipants(io, roomCode);

      logger.info(
        `[${roomCode}] Role assigned: User '${targetUserId}' -> ${targetRole} by Host '${requesterUsername}'`
      );
    } catch (err: any) {
      logger.error('Error handling assign_role socket event:', err);
      socket.emit(SOCKET_EVENTS.ERROR, {
        code: err.errorCode || 'ASSIGN_ROLE_ERROR',
        message: err.message || 'Failed to assign role',
      });
    }
  });

  // ==========================================================================
  // EVENT: remove_participant
  // Payload: { userId: string }
  // Only Host can remove / kick participants.
  // ==========================================================================
  socket.on(SOCKET_EVENTS.REMOVE_PARTICIPANT, async (payload: RemoveParticipantPayload) => {
    try {
      const auth = await authorizeHostAction('remove_participant');
      if (!auth) return;

      const { roomCode, userId: requesterUserId, username: requesterUsername, role: requesterRole } = auth;

      // 1. Centralized permission check: Only Host can remove participants
      if (!canRemoveParticipant(requesterRole)) {
        logger.warn(
          `Unauthorized participant removal attempt: [user=${requesterUsername}, role=${requesterRole}, room=${roomCode}]`
        );
        socket.emit(SOCKET_EVENTS.ERROR, {
          code: 'FORBIDDEN_REMOVE_PARTICIPANT',
          message: 'Permission denied: Only the Host can remove participants from the room',
        });
        return;
      }

      // 2. Validate payload presence
      const targetUserId = (payload?.userId || payload?.targetUserId)?.trim();
      if (!targetUserId) {
        socket.emit(SOCKET_EVENTS.ERROR, {
          code: 'INVALID_PAYLOAD',
          message: 'userId is required to remove participant',
        });
        return;
      }

      // 3. Host cannot remove themselves
      if (targetUserId === requesterUserId) {
        socket.emit(SOCKET_EVENTS.ERROR, {
          code: 'CANNOT_REMOVE_HOST',
          message: 'Host cannot remove themselves from the room. To leave, transfer host ownership first.',
        });
        return;
      }

      // 4. Verify target user belongs to the same room
      const targetParticipant = await getParticipant(roomCode, targetUserId);
      if (!targetParticipant) {
        socket.emit(SOCKET_EVENTS.ERROR, {
          code: 'USER_NOT_FOUND',
          message: 'Target user does not exist in this room',
        });
        return;
      }

      // Ensure target is not the host (protected role)
      if (targetParticipant.role === Role.HOST) {
        socket.emit(SOCKET_EVENTS.ERROR, {
          code: 'CANNOT_REMOVE_HOST',
          message: 'The room Host cannot be removed from the room.',
        });
        return;
      }

      // 5. Remove participant from persistent MongoDB storage
      const removalResult = await roomService.removeParticipant(roomCode, requesterUserId, targetUserId);

      // 6. Notify the target user before disconnecting when online
      const targetSockets = getSocketIdsForUser(roomCode, targetUserId);
      for (const targetSocketId of targetSockets) {
        const targetSocket = io.sockets.sockets.get(targetSocketId) as CustomSocket | undefined;
        if (targetSocket) {
          // Notify target socket with descriptive reason
          targetSocket.emit(SOCKET_EVENTS.PARTICIPANT_REMOVED, {
            userId: targetUserId,
            targetUserId,
            removedBy: requesterUsername,
            reason: `You were removed from the room by the Host (${requesterUsername})`,
          });

          // Target socket leaves Socket.IO room channel
          await targetSocket.leave(roomCode);

          // Clear cached session & runtime memory state
          delete targetSocket.data.session;
          removeRuntimeParticipant(targetSocketId);

          // Disconnect the target socket
          targetSocket.disconnect(true);
        }
      }

      // 7. Broadcast participant_removed to remaining room members
      io.to(roomCode).emit(SOCKET_EVENTS.PARTICIPANT_REMOVED, {
        userId: removalResult.userId,
        targetUserId: removalResult.targetUserId,
        removedBy: requesterUsername,
      });

      // 8. Broadcast refreshed participant list to remaining room members
      await broadcastParticipants(io, roomCode);

      logger.info(
        `[${roomCode}] Participant '${targetUserId}' removed by Host '${requesterUsername}'`
      );
    } catch (err: any) {
      logger.error('Error handling remove_participant socket event:', err);
      socket.emit(SOCKET_EVENTS.ERROR, {
        code: err.errorCode || 'REMOVE_PARTICIPANT_ERROR',
        message: err.message || 'Failed to remove participant',
      });
    }
  });

  // ==========================================================================
  // EVENT: transfer_host
  // Payload: { targetUserId: string }
  // Only Host can transfer room ownership.
  // ==========================================================================
  socket.on(SOCKET_EVENTS.TRANSFER_HOST, async (payload: TransferHostPayload) => {
    try {
      const auth = await authorizeHostAction('transfer_host');
      if (!auth) return;

      const { roomCode, userId: requesterUserId, username: requesterUsername, role: requesterRole } = auth;

      // Centralized permission check: Only Host can transfer host
      if (!canTransferHost(requesterRole)) {
        logger.warn(
          `Unauthorized host transfer attempt: [user=${requesterUsername}, role=${requesterRole}, room=${roomCode}]`
        );
        socket.emit(SOCKET_EVENTS.ERROR, {
          code: 'FORBIDDEN_HOST_TRANSFER',
          message: 'Permission denied: Only the current Host can transfer room ownership',
        });
        return;
      }

      if (!payload || !payload.targetUserId) {
        socket.emit(SOCKET_EVENTS.ERROR, {
          code: 'INVALID_PAYLOAD',
          message: 'targetUserId is required to transfer host',
        });
        return;
      }

      const { targetUserId } = payload;

      // Execute host transfer in persistent MongoDB storage
      const result = await roomService.transferHost(roomCode, requesterUserId, targetUserId);

      // Update runtime memory: previous host -> MODERATOR, new host -> HOST
      updateParticipantRoleInRuntime(roomCode, requesterUserId, Role.MODERATOR);
      updateParticipantRoleInRuntime(roomCode, targetUserId, Role.HOST);

      // Update socket session data
      if (socket.data.session) {
        socket.data.session.role = Role.MODERATOR;
      }
      const newHostSockets = getSocketIdsForUser(roomCode, targetUserId);
      for (const newHostSocketId of newHostSockets) {
        const newHostSocket = io.sockets.sockets.get(newHostSocketId) as CustomSocket | undefined;
        if (newHostSocket && newHostSocket.data.session) {
          newHostSocket.data.session.role = Role.HOST;
        }
      }

      // Broadcast host_transferred to room
      io.to(roomCode).emit(SOCKET_EVENTS.HOST_TRANSFERRED, {
        previousHostUserId: result.previousHostUserId,
        newHostUserId: result.newHostUserId,
        updatedBy: requesterUsername,
      });

      // Broadcast refreshed participant list
      await broadcastParticipants(io, roomCode);

      logger.info(
        `[${roomCode}] Host transferred: ${requesterUserId} -> ${targetUserId} by '${requesterUsername}'`
      );
    } catch (err: any) {
      logger.error('Error handling transfer_host socket event:', err);
      socket.emit(SOCKET_EVENTS.ERROR, {
        code: err.errorCode || 'TRANSFER_HOST_ERROR',
        message: err.message || 'Failed to transfer host',
      });
    }
  });
}
