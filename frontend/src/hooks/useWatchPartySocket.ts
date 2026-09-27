import { useEffect, useState, useRef, useCallback } from 'react';
import { socketService } from '../socket/socket';
import type { SafeRoomDto, Role } from '../types/room.types';
import type {
  SyncStatePayload,
  PlaybackBroadcastPayload,
  SeekBroadcastPayload,
  ChangeVideoBroadcastPayload,
  UserJoinedPayload,
  UserLeftPayload,
  ParticipantUpdatePayload,
  RoleAssignedBroadcastPayload,
  ParticipantRemovedBroadcastPayload,
  HostTransferredBroadcastPayload,
  ActionRequestCreatedPayload,
  ActionRequestApprovedPayload,
  ActionRequestRejectedPayload,
  ActionRequestType,
  SocketErrorPayload,
} from '../types/socket.types';
import { SOCKET_EVENTS } from '../types/socket.types';
import type { YouTubePlayerHandle } from '../components/room/YouTubePlayer';

export interface ActionNotification {
  id: string;
  title?: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

interface UseWatchPartySocketProps {
  roomCode: string;
  username: string;
  userId: string;
  initialRoom: SafeRoomDto | null;
  playerRef: React.RefObject<YouTubePlayerHandle | null>;
  currentRole: Role;
  onRoleUpdate: (newRole: Role) => void;
  onRemovedByHost: (reason?: string) => void;
}

export function useWatchPartySocket({
  roomCode,
  username,
  userId,
  initialRoom,
  playerRef,
  currentRole,
  onRoleUpdate,
  onRemovedByHost,
}: UseWatchPartySocketProps) {
  const [room, setRoom] = useState<SafeRoomDto | null>(initialRoom);
  const [currentTime, setCurrentTime] = useState<number>(initialRoom?.playbackTime || 0);
  const [duration, setDuration] = useState<number>(0);
  const [socketConnected, setSocketConnected] = useState<boolean>(false);
  const [isReconnecting, setIsReconnecting] = useState<boolean>(false);
  const [socketError, setSocketError] = useState<string | null>(null);

  // Participant Change-Requests Queue
  const [actionRequests, setActionRequests] = useState<ActionRequestCreatedPayload[]>([]);
  const [notifications, setNotifications] = useState<ActionNotification[]>([]);

  const isHostOrMod = currentRole === 'host' || currentRole === 'moderator';
  const isHostOrModRef = useRef(isHostOrMod);
  isHostOrModRef.current = isHostOrMod;

  const currentUserIdRef = useRef(userId);
  currentUserIdRef.current = userId;

  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;

  const addNotification = useCallback(
    (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info', title?: string) => {
      const notif: ActionNotification = {
        id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        title,
        message,
        type,
      };
      setNotifications((prev) => [...prev, notif]);

      setTimeout(() => {
        setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
      }, 5000);
    },
    []
  );

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  // Sync initialRoom when loaded via REST API
  useEffect(() => {
    if (initialRoom && !room) {
      setRoom(initialRoom);
      setCurrentTime(initialRoom.playbackTime);
    }
  }, [initialRoom, room]);

  useEffect(() => {
    if (!roomCode || !username) return;

    const socket = socketService.connect();

    // -------------------------------------------------------------------------
    // 1. Connection & Reconnection Lifecycle
    // -------------------------------------------------------------------------
    const handleConnect = () => {
      setSocketConnected(true);
      setIsReconnecting(false);

      socketService.joinRoom({
        roomCode,
        username,
        userId: currentUserIdRef.current || undefined,
      });
    };

    const handleDisconnect = (reason: string) => {
      setSocketConnected(false);
      if (reason !== 'io client disconnect') {
        addNotification(
          'Connection lost. Real-time synchronization is temporarily paused.',
          'warning',
          'Socket Disconnected'
        );
      }
    };

    const handleReconnectAttempt = () => {
      setIsReconnecting(true);
    };

    const handleReconnect = () => {
      setIsReconnecting(false);
      setSocketConnected(true);
      addNotification(
        'Reconnected to Watch Party server! Playback sync restored.',
        'success',
        'Sync Restored'
      );

      socketService.joinRoom({
        roomCode,
        username,
        userId: currentUserIdRef.current || undefined,
      });
    };

    // -------------------------------------------------------------------------
    // 2. Authoritative Remote State Updates (NO ECHO LOOPS)
    // -------------------------------------------------------------------------
    const handleSyncState = (data: SyncStatePayload) => {
      setRoom((prev) =>
        prev
          ? {
              ...prev,
              playbackState: data.playState,
              playbackTime: data.currentTime,
              currentVideoId: data.videoId,
              participants: data.participants,
              participantCount: data.participants.length,
            }
          : prev
      );
      setCurrentTime(data.currentTime);

      if (data.userRole) {
        onRoleUpdate(data.userRole);
      }

      playerRef.current?.applyRemoteChangeVideo(data.videoId, data.currentTime, data.playState);
    };

    const handleRemotePlay = (data: PlaybackBroadcastPayload) => {
      setRoom((prev) => (prev ? { ...prev, playbackState: 'playing', playbackTime: data.currentTime } : prev));
      setCurrentTime(data.currentTime);
      playerRef.current?.applyRemotePlay(data.currentTime);
    };

    const handleRemotePause = (data: PlaybackBroadcastPayload) => {
      setRoom((prev) => (prev ? { ...prev, playbackState: 'paused', playbackTime: data.currentTime } : prev));
      setCurrentTime(data.currentTime);
      playerRef.current?.applyRemotePause(data.currentTime);
    };

    const handleRemoteSeek = (data: SeekBroadcastPayload) => {
      setRoom((prev) => (prev ? { ...prev, playbackTime: data.currentTime } : prev));
      setCurrentTime(data.currentTime);
      playerRef.current?.applyRemoteSeek(data.currentTime);
    };

    const handleRemoteChangeVideo = (data: ChangeVideoBroadcastPayload) => {
      setRoom((prev) =>
        prev
          ? {
              ...prev,
              currentVideoId: data.videoId,
              playbackState: data.playState,
              playbackTime: data.currentTime,
            }
          : prev
      );
      setCurrentTime(data.currentTime);
      playerRef.current?.applyRemoteChangeVideo(data.videoId, data.currentTime, data.playState);
    };

    // -------------------------------------------------------------------------
    // 3. Presence & Membership Broadcasts
    // -------------------------------------------------------------------------
    const handleUserJoined = (data: UserJoinedPayload) => {
      setRoom((prev) => {
        if (!prev) return prev;
        const exists = prev.participants.some((p) => p.userId === data.user.userId);
        const updatedParticipants = exists
          ? prev.participants.map((p) => (p.userId === data.user.userId ? { ...p, isOnline: true } : p))
          : [...prev.participants, data.user];

        return {
          ...prev,
          participants: updatedParticipants,
          participantCount: data.participantCount,
        };
      });
    };

    const handleUserLeft = (data: UserLeftPayload) => {
      setRoom((prev) => {
        if (!prev) return prev;
        const updatedParticipants = prev.participants.map((p) =>
          p.userId === data.userId ? { ...p, isOnline: false } : p
        );

        return {
          ...prev,
          participants: updatedParticipants,
          participantCount: data.participantCount,
        };
      });
    };

    const handleParticipantUpdate = (data: ParticipantUpdatePayload) => {
      setRoom((prev) =>
        prev
          ? {
              ...prev,
              participants: data.participants,
              participantCount: data.participantCount,
            }
          : prev
      );
    };

    const handleRoleAssigned = (data: RoleAssignedBroadcastPayload) => {
      const myId = currentUserIdRef.current;
      const targetId = data.targetUserId || data.userId;
      const newRole = data.newRole || data.role;

      setRoom((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          participants: prev.participants.map((p) =>
            p.userId === targetId ? { ...p, role: newRole } : p
          ),
        };
      });

      if (targetId === myId) {
        onRoleUpdate(newRole);
        addNotification(`Your role was updated to ${newRole.toUpperCase()} by ${data.updatedBy}.`, 'info');
      }
    };

    const handleHostTransferred = (data: HostTransferredBroadcastPayload) => {
      const myId = currentUserIdRef.current;

      setRoom((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          hostUserId: data.newHostUserId,
          participants: prev.participants.map((p) => {
            if (p.userId === data.newHostUserId) {
              return { ...p, role: 'host' as Role };
            }
            if (p.userId === data.previousHostUserId) {
              return { ...p, role: 'moderator' as Role };
            }
            return p;
          }),
        };
      });

      if (data.newHostUserId === myId) {
        onRoleUpdate('host');
        addNotification('You are now the room Host!', 'success');
      } else if (data.previousHostUserId === myId) {
        onRoleUpdate('moderator');
        addNotification('Host transferred. You are now a Moderator.', 'info');
      }
    };

    const handleParticipantRemoved = (data: ParticipantRemovedBroadcastPayload) => {
      const myId = currentUserIdRef.current;

      if (data.targetUserId === myId) {
        socketService.disconnect();
        onRemovedByHost(data.reason || 'You have been removed from this room by the Host.');
      } else {
        setRoom((prev) => {
          if (!prev) return prev;
          const remaining = prev.participants.filter((p) => p.userId !== data.targetUserId);
          return {
            ...prev,
            participants: remaining,
            participantCount: remaining.length,
          };
        });
      }
    };

    // -------------------------------------------------------------------------
    // 4. Participant Change-Request Workflow Broadcasts
    // -------------------------------------------------------------------------
    const handleActionRequestCreated = (data: ActionRequestCreatedPayload) => {
      setActionRequests((prev) => {
        if (prev.some((r) => r.requestId === data.requestId)) return prev;
        return [...prev, data];
      });

      const myId = currentUserIdRef.current;
      if (data.requesterUserId === myId) {
        addNotification(
          `Your ${data.action.toUpperCase()} request is pending review by the Host/Moderator.`,
          'info',
          'Request Pending'
        );
      }
    };

    const handleActionRequestApproved = (data: ActionRequestApprovedPayload) => {
      setActionRequests((prev) => prev.filter((r) => r.requestId !== data.requestId));

      const myId = currentUserIdRef.current;
      if (data.requesterUserId === myId) {
        addNotification(
          `Your ${data.action.toUpperCase()} request was approved by ${data.approvedBy}! Video synchronized.`,
          'success',
          'Request Approved'
        );
      }
    };

    const handleActionRequestRejected = (data: ActionRequestRejectedPayload) => {
      setActionRequests((prev) => prev.filter((r) => r.requestId !== data.requestId));

      const myId = currentUserIdRef.current;
      if (data.requesterUserId === myId) {
        const reason = data.reason ? `: ${data.reason}` : '';
        addNotification(
          `Your ${data.action.toUpperCase()} request was rejected by ${data.rejectedBy}${reason}.`,
          'warning',
          'Request Rejected'
        );
      }
    };

    const handleSocketError = (data: SocketErrorPayload) => {
      const isUnauthorized = data.code === 'UNAUTHORIZED' || data.code === 'FORBIDDEN';
      const title = isUnauthorized ? 'Unauthorized Action' : 'Sync Error';
      const message = isUnauthorized
        ? (data.message || 'You do not have permission to control playback. Propose an action using "Request Control".')
        : (data.message || 'An error occurred during real-time sync.');

      addNotification(message, 'error', title);
      setSocketError(message);
      setTimeout(() => setSocketError(null), 5000);
    };

    // -------------------------------------------------------------------------
    // Bind Event Listeners
    // -------------------------------------------------------------------------
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.io.on('reconnect_attempt', handleReconnectAttempt);
    socket.io.on('reconnect', handleReconnect);

    const unsubs = [
      socketService.on(SOCKET_EVENTS.SYNC_STATE, handleSyncState),
      socketService.on(SOCKET_EVENTS.PLAY, handleRemotePlay),
      socketService.on(SOCKET_EVENTS.PAUSE, handleRemotePause),
      socketService.on(SOCKET_EVENTS.SEEK, handleRemoteSeek),
      socketService.on(SOCKET_EVENTS.CHANGE_VIDEO, handleRemoteChangeVideo),
      socketService.on(SOCKET_EVENTS.USER_JOINED, handleUserJoined),
      socketService.on(SOCKET_EVENTS.USER_LEFT, handleUserLeft),
      socketService.on(SOCKET_EVENTS.PARTICIPANT_UPDATE, handleParticipantUpdate),
      socketService.on(SOCKET_EVENTS.ROLE_ASSIGNED, handleRoleAssigned),
      socketService.on(SOCKET_EVENTS.HOST_TRANSFERRED, handleHostTransferred),
      socketService.on(SOCKET_EVENTS.PARTICIPANT_REMOVED, handleParticipantRemoved),
      socketService.on(SOCKET_EVENTS.ACTION_REQUEST_CREATED, handleActionRequestCreated),
      socketService.on(SOCKET_EVENTS.ACTION_REQUEST_APPROVED, handleActionRequestApproved),
      socketService.on(SOCKET_EVENTS.ACTION_REQUEST_REJECTED, handleActionRequestRejected),
      socketService.on(SOCKET_EVENTS.ERROR, handleSocketError),
    ];

    if (socket.connected) {
      handleConnect();
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.io.off('reconnect_attempt', handleReconnectAttempt);
      socket.io.off('reconnect', handleReconnect);

      unsubs.forEach((unsub) => unsub());

      socketService.leaveRoom({ roomCode });
      socketService.disconnect();
    };
  }, [roomCode, username, onRoleUpdate, onRemovedByHost, playerRef, addNotification]);

  // ---------------------------------------------------------------------------
  // 5. Direct Playback Actions (Host & Moderator Only)
  // ---------------------------------------------------------------------------

  const play = useCallback(() => {
    if (!isHostOrModRef.current) return;
    const targetTime = playerRef.current?.getCurrentTime() ?? currentTimeRef.current;
    setRoom((prev) => (prev ? { ...prev, playbackState: 'playing' } : prev));
    playerRef.current?.applyRemotePlay(targetTime);
    socketService.play({ currentTime: targetTime });
  }, [playerRef]);

  const pause = useCallback(() => {
    if (!isHostOrModRef.current) return;
    const targetTime = playerRef.current?.getCurrentTime() ?? currentTimeRef.current;
    setRoom((prev) => (prev ? { ...prev, playbackState: 'paused' } : prev));
    playerRef.current?.applyRemotePause(targetTime);
    socketService.pause({ currentTime: targetTime });
  }, [playerRef]);

  const seek = useCallback(
    (targetTime: number) => {
      if (!isHostOrModRef.current) return;
      setCurrentTime(targetTime);
      setRoom((prev) => (prev ? { ...prev, playbackTime: targetTime } : prev));
      playerRef.current?.applyRemoteSeek(targetTime);
      socketService.seek({ time: targetTime });
    },
    [playerRef]
  );

  const changeVideo = useCallback(
    (newVideoId: string) => {
      if (!isHostOrModRef.current) return;
      setRoom((prev) =>
        prev
          ? {
              ...prev,
              currentVideoId: newVideoId,
              playbackState: 'paused',
              playbackTime: 0,
            }
          : prev
      );
      setCurrentTime(0);
      playerRef.current?.applyRemoteChangeVideo(newVideoId, 0, 'paused');
      socketService.changeVideo({ videoId: newVideoId });
    },
    [playerRef]
  );

  const handleTimeUpdate = useCallback((time: number, totalDuration: number) => {
    setCurrentTime(time);
    if (totalDuration > 0) {
      setDuration(totalDuration);
    }
  }, []);

  const handleIframePlay = useCallback(
    (time: number) => {
      if (!isHostOrModRef.current) return;
      setRoom((prev) => (prev ? { ...prev, playbackState: 'playing', playbackTime: time } : prev));
      socketService.play({ currentTime: time });
    },
    []
  );

  const handleIframePause = useCallback(
    (time: number) => {
      if (!isHostOrModRef.current) return;
      setRoom((prev) => (prev ? { ...prev, playbackState: 'paused', playbackTime: time } : prev));
      socketService.pause({ currentTime: time });
    },
    []
  );

  // ---------------------------------------------------------------------------
  // 6. Participant Change-Request Submissions
  // ---------------------------------------------------------------------------

  const submitActionRequest = useCallback(
    (action: ActionRequestType, options?: { time?: number; videoId?: string }) => {
      const targetTime =
        options?.time !== undefined
          ? options.time
          : (playerRef.current?.getCurrentTime() ?? currentTimeRef.current);

      socketService.requestAction({
        action,
        time: targetTime,
        currentTime: currentTimeRef.current,
        videoId: options?.videoId,
      });
    },
    [playerRef]
  );

  const approveRequest = useCallback((requestId: string) => {
    socketService.approveAction({ requestId });
  }, []);

  const rejectRequest = useCallback((requestId: string, reason?: string) => {
    socketService.rejectAction({ requestId, reason });
  }, []);

  // ---------------------------------------------------------------------------
  // 7. Role Management & Moderation (Host Only)
  // ---------------------------------------------------------------------------

  const assignRole = useCallback((targetUserId: string, newRole: 'moderator' | 'participant') => {
    socketService.assignRole({ targetUserId, newRole });
  }, []);

  const removeParticipant = useCallback((targetUserId: string) => {
    socketService.removeParticipant({ targetUserId });
  }, []);

  const transferHost = useCallback((targetUserId: string) => {
    socketService.transferHost({ targetUserId });
  }, []);

  const leave = useCallback(() => {
    socketService.leaveRoom({ roomCode });
    socketService.disconnect();
  }, [roomCode]);

  const hasPendingRequest = actionRequests.some(
    (r) => r.requesterUserId === userId
  );

  const reconnect = useCallback(() => {
    socketService.connect();
    socketService.joinRoom({
      roomCode,
      username,
      userId: currentUserIdRef.current || undefined,
    });
  }, [roomCode, username]);

  return {
    room,
    currentTime,
    duration,
    socketConnected,
    isReconnecting,
    socketError,
    actionRequests,
    notifications,
    hasPendingRequest,
    removeNotification,
    actions: {
      play,
      pause,
      seek,
      changeVideo,
      handleTimeUpdate,
      handleIframePlay,
      handleIframePause,
      submitActionRequest,
      approveRequest,
      rejectRequest,
      assignRole,
      removeParticipant,
      transferHost,
      leave,
      reconnect,
    },
  };
}
