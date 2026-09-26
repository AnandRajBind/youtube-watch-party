import { Server as SocketIOServer } from 'socket.io';
import { checkRole, getParticipant, getRuntimeParticipant } from '../roomSocket';
import { actionRequestService } from '../../services/actionRequestService';
import { canApproveAction } from '../../services/permissionService';
import { PlaybackState, Role } from '../../types/room.types';
import {
  ApproveActionPayload,
  CustomSocket,
  RejectActionPayload,
  RequestActionPayload,
  SOCKET_EVENTS,
} from '../socketTypes';
import { logger } from '../../utils/logger';

interface AuthorizedContext {
  roomCode: string;
  userId: string;
  username: string;
  role: Role;
}

export function registerActionRequestHandlers(io: SocketIOServer, socket: CustomSocket): void {
  /**
   * Helper: validates session and checks room membership.
   */
  async function getSocketContext(eventName: string): Promise<AuthorizedContext | null> {
    const session = socket.data.session || getRuntimeParticipant(socket.id);
    if (!session || !session.roomCode || !session.userId) {
      socket.emit(SOCKET_EVENTS.ERROR, {
        code: 'UNAUTHORIZED',
        message: `Authentication required to perform '${eventName}'`,
      });
      return null;
    }

    const { roomCode, userId } = session;

    const persistentParticipant = await getParticipant(roomCode, userId);
    if (!persistentParticipant) {
      socket.emit(SOCKET_EVENTS.ERROR, {
        code: 'NOT_A_MEMBER',
        message: 'You are not a member of this room',
      });
      return null;
    }

    const actualRole = await checkRole(roomCode, userId);

    return {
      roomCode,
      userId,
      username: persistentParticipant.username,
      role: actualRole,
    };
  }

  // ==========================================================================
  // EVENT: request_action
  // Payload: { action: 'play' | 'pause' | 'seek' | 'change_video', time?: number, videoId?: string }
  // Participants can request playback or video changes.
  // ==========================================================================
  socket.on(SOCKET_EVENTS.REQUEST_ACTION, async (payload: RequestActionPayload) => {
    try {
      const auth = await getSocketContext('request_action');
      if (!auth) return;

      if (!payload || !payload.action) {
        socket.emit(SOCKET_EVENTS.ERROR, {
          code: 'INVALID_PAYLOAD',
          message: 'action is required for request_action',
        });
        return;
      }

      const { roomCode, userId, username } = auth;

      // Create pending change request
      const requestItem = actionRequestService.createRequest(
        roomCode,
        userId,
        username,
        payload.action,
        {
          time: payload.time !== undefined ? payload.time : payload.currentTime,
          videoId: payload.videoId,
        }
      );

      // Broadcast action_request_created to room (Host, Mods, and requester)
      io.to(roomCode).emit(SOCKET_EVENTS.ACTION_REQUEST_CREATED, {
        requestId: requestItem.requestId,
        requesterUserId: requestItem.requesterUserId,
        requesterUsername: requestItem.requesterUsername,
        action: requestItem.action,
        time: requestItem.time,
        videoId: requestItem.videoId,
        createdAt: requestItem.createdAt,
      });

      logger.info(
        `[${roomCode}] Action request broadcasted: [id=${requestItem.requestId}, action=${requestItem.action}, user=${username}]`
      );
    } catch (err: any) {
      logger.error('Error handling request_action socket event:', err);
      socket.emit(SOCKET_EVENTS.ERROR, {
        code: err.errorCode || 'REQUEST_ACTION_ERROR',
        message: err.message || 'Failed to submit action request',
      });
    }
  });

  // ==========================================================================
  // EVENT: approve_action
  // Payload: { requestId: string }
  // Host and Moderator only.
  // Only after approval is the corresponding playback action executed and broadcast.
  // ==========================================================================
  socket.on(SOCKET_EVENTS.APPROVE_ACTION, async (payload: ApproveActionPayload) => {
    try {
      const auth = await getSocketContext('approve_action');
      if (!auth) return;

      const { roomCode, role, username: approverUsername } = auth;

      // Permission check: Host or Moderator only (Participants rejected)
      if (!canApproveAction(role)) {
        logger.warn(
          `Unauthorized action approval attempt: [user=${approverUsername}, role=${role}, room=${roomCode}]`
        );
        socket.emit(SOCKET_EVENTS.ERROR, {
          code: 'FORBIDDEN_APPROVAL',
          message: 'Permission denied: Only the Host or a Moderator can approve change requests',
        });
        return;
      }

      if (!payload || !payload.requestId) {
        socket.emit(SOCKET_EVENTS.ERROR, {
          code: 'INVALID_PAYLOAD',
          message: 'requestId is required to approve action',
        });
        return;
      }

      // Approve request and execute playback action in MongoDB
      const result = await actionRequestService.approveRequest(
        payload.requestId,
        roomCode,
        auth.userId,
        approverUsername
      );

      const triggeredByLabel = `${result.request.requesterUsername} (Approved by ${approverUsername})`;

      // Broadcast corresponding playback event to room members
      if (result.request.action === 'play') {
        io.to(roomCode).emit(SOCKET_EVENTS.PLAY, {
          currentTime: result.targetTime,
          serverTimestamp: Date.now(),
          triggeredBy: triggeredByLabel,
        });
      } else if (result.request.action === 'pause') {
        io.to(roomCode).emit(SOCKET_EVENTS.PAUSE, {
          currentTime: result.targetTime,
          serverTimestamp: Date.now(),
          triggeredBy: triggeredByLabel,
        });
      } else if (result.request.action === 'seek') {
        io.to(roomCode).emit(SOCKET_EVENTS.SEEK, {
          currentTime: result.targetTime,
          serverTimestamp: Date.now(),
          triggeredBy: triggeredByLabel,
        });
      } else if (result.request.action === 'change_video') {
        io.to(roomCode).emit(SOCKET_EVENTS.CHANGE_VIDEO, {
          videoId: result.videoId,
          playState: PlaybackState.PAUSED,
          currentTime: 0,
          serverTimestamp: Date.now(),
          triggeredBy: triggeredByLabel,
        });
      }

      // Broadcast action_request_approved event
      io.to(roomCode).emit(SOCKET_EVENTS.ACTION_REQUEST_APPROVED, {
        requestId: result.request.requestId,
        action: result.request.action,
        approvedBy: approverUsername,
        requesterUserId: result.request.requesterUserId,
        requesterUsername: result.request.requesterUsername,
        time: result.targetTime,
        videoId: result.videoId,
      });

      logger.info(
        `[${roomCode}] Action request ${result.request.requestId} approved and executed by ${approverUsername}`
      );
    } catch (err: any) {
      logger.error('Error handling approve_action socket event:', err);
      socket.emit(SOCKET_EVENTS.ERROR, {
        code: err.errorCode || 'APPROVE_ACTION_ERROR',
        message: err.message || 'Failed to approve action request',
      });
    }
  });

  // ==========================================================================
  // EVENT: reject_action
  // Payload: { requestId: string, reason?: string }
  // Host and Moderator only.
  // ==========================================================================
  socket.on(SOCKET_EVENTS.REJECT_ACTION, async (payload: RejectActionPayload) => {
    try {
      const auth = await getSocketContext('reject_action');
      if (!auth) return;

      const { roomCode, role, username: rejecterUsername } = auth;

      // Permission check: Host or Moderator only (Participants rejected)
      if (!canApproveAction(role)) {
        logger.warn(
          `Unauthorized action rejection attempt: [user=${rejecterUsername}, role=${role}, room=${roomCode}]`
        );
        socket.emit(SOCKET_EVENTS.ERROR, {
          code: 'FORBIDDEN_APPROVAL',
          message: 'Permission denied: Only the Host or a Moderator can reject change requests',
        });
        return;
      }

      if (!payload || !payload.requestId) {
        socket.emit(SOCKET_EVENTS.ERROR, {
          code: 'INVALID_PAYLOAD',
          message: 'requestId is required to reject action',
        });
        return;
      }

      // Reject action request
      const rejectedReq = actionRequestService.rejectRequest(
        payload.requestId,
        roomCode,
        auth.userId,
        rejecterUsername,
        payload.reason
      );

      // Broadcast action_request_rejected event
      io.to(roomCode).emit(SOCKET_EVENTS.ACTION_REQUEST_REJECTED, {
        requestId: rejectedReq.requestId,
        action: rejectedReq.action,
        rejectedBy: rejecterUsername,
        requesterUserId: rejectedReq.requesterUserId,
        requesterUsername: rejectedReq.requesterUsername,
        reason: payload.reason,
      });

      logger.info(
        `[${roomCode}] Action request ${rejectedReq.requestId} rejected by ${rejecterUsername}`
      );
    } catch (err: any) {
      logger.error('Error handling reject_action socket event:', err);
      socket.emit(SOCKET_EVENTS.ERROR, {
        code: err.errorCode || 'REJECT_ACTION_ERROR',
        message: err.message || 'Failed to reject action request',
      });
    }
  });
}
