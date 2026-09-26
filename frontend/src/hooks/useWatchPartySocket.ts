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
  SocketErrorPayload,
} from '../types/socket.types';
import { SOCKET_EVENTS } from '../types/socket.types';
import type { YouTubePlayerHandle } from '../components/room/YouTubePlayer';

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

  const isHostOrMod = currentRole === 'host' || currentRole === 'moderator';
  const isHostOrModRef = useRef(isHostOrMod);
  isHostOrModRef.current = isHostOrMod;

  const currentUserIdRef = useRef(userId);
  currentUserIdRef.current = userId;

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

      // Join room with server-side identity assertion
      socketService.joinRoom({
        roomCode,
        username,
        userId: currentUserIdRef.current || undefined,
      });
    };

    const handleDisconnect = (_reason: string) => {
      setSocketConnected(false);
    };

    const handleReconnectAttempt = () => {
      setIsReconnecting(true);
    };

    const handleReconnect = () => {
      setIsReconnecting(false);
      setSocketConnected(true);

      // Re-join room on reconnection to restore presence and request fresh state
      socketService.joinRoom({
        roomCode,
        username,
        userId: currentUserIdRef.current || undefined,
      });
    };

    // -------------------------------------------------------------------------
    // 2. Authoritative Remote State Updates (NO ECHO LOOPS)
    // -------------------------------------------------------------------------

    // sync_state: Complete authoritative snapshot on join / reconnect
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

      // Initialize / Synchronize YouTube Player without emitting back to server
      playerRef.current?.applyRemoteChangeVideo(data.videoId, data.currentTime, data.playState);
    };

    // play: Remote broadcast triggered by authorized member
    const handleRemotePlay = (data: PlaybackBroadcastPayload) => {
      setRoom((prev) => (prev ? { ...prev, playbackState: 'playing', playbackTime: data.currentTime } : prev));
      setCurrentTime(data.currentTime);
      // Play local YouTube player without echoing back
      playerRef.current?.applyRemotePlay(data.currentTime);
    };

    // pause: Remote broadcast
    const handleRemotePause = (data: PlaybackBroadcastPayload) => {
      setRoom((prev) => (prev ? { ...prev, playbackState: 'paused', playbackTime: data.currentTime } : prev));
      setCurrentTime(data.currentTime);
      // Pause local YouTube player without echoing back
      playerRef.current?.applyRemotePause(data.currentTime);
    };

    // seek: Remote broadcast
    const handleRemoteSeek = (data: SeekBroadcastPayload) => {
      setRoom((prev) => (prev ? { ...prev, playbackTime: data.currentTime } : prev));
      setCurrentTime(data.currentTime);
      // Seek local YouTube player without echoing back
      playerRef.current?.applyRemoteSeek(data.currentTime);
    };

    // change_video: Remote broadcast
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
      // Change video on local YouTube player without echoing back
      playerRef.current?.applyRemoteChangeVideo(data.videoId, data.currentTime, data.playState);
    };

    // -------------------------------------------------------------------------
    // 3. Presence & Membership Broadcasts
    // -------------------------------------------------------------------------

    // user_joined: A new participant joined the room
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

    // user_left: A participant disconnected / left the room
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

    // participant_update: Full authoritative participant list refreshed
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

    // role_assigned: Host promoted or demoted a member
    const handleRoleAssigned = (data: RoleAssignedBroadcastPayload) => {
      const myId = currentUserIdRef.current;
      const targetId = data.targetUserId || data.userId;
      const newRole = data.newRole || data.role;

      // Update role in local participant list
      setRoom((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          participants: prev.participants.map((p) =>
            p.userId === targetId ? { ...p, role: newRole } : p
          ),
        };
      });

      // If current user is the target, update active permissions
      if (targetId === myId) {
        onRoleUpdate(newRole);
      }
    };

    // participant_removed: Host removed a member
    const handleParticipantRemoved = (data: ParticipantRemovedBroadcastPayload) => {
      const myId = currentUserIdRef.current;

      if (data.targetUserId === myId) {
        // Current user was kicked by the host
        socketService.disconnect();
        onRemovedByHost(data.reason || 'You have been removed from this room by the Host.');
      } else {
        // Another participant was removed
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

    // error: Server validation or authorization rejection
    const handleSocketError = (data: SocketErrorPayload) => {
      setSocketError(data.message || 'An error occurred during real-time sync.');
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
      socketService.on(SOCKET_EVENTS.PARTICIPANT_REMOVED, handleParticipantRemoved),
      socketService.on(SOCKET_EVENTS.ERROR, handleSocketError),
    ];

    if (socket.connected) {
      handleConnect();
    }

    // -------------------------------------------------------------------------
    // Cleanup on Component Unmount / Leaving Page
    // -------------------------------------------------------------------------
    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.io.off('reconnect_attempt', handleReconnectAttempt);
      socket.io.off('reconnect', handleReconnect);

      unsubs.forEach((unsub) => unsub());

      // Safely notify server of departure and sever connection
      socketService.leaveRoom({ roomCode });
      socketService.disconnect();
    };
  }, [roomCode, username, onRoleUpdate, onRemovedByHost, playerRef]);

  // ---------------------------------------------------------------------------
  // 4. Local User Control Actions (Host & Moderator Only)
  // ---------------------------------------------------------------------------

  const play = useCallback(() => {
    if (!isHostOrModRef.current) return;
    setRoom((prev) => (prev ? { ...prev, playbackState: 'playing' } : prev));
    playerRef.current?.applyRemotePlay(currentTime);
    socketService.play({ currentTime });
  }, [currentTime, playerRef]);

  const pause = useCallback(() => {
    if (!isHostOrModRef.current) return;
    setRoom((prev) => (prev ? { ...prev, playbackState: 'paused' } : prev));
    playerRef.current?.applyRemotePause(currentTime);
    socketService.pause({ currentTime });
  }, [currentTime, playerRef]);

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

  // Playhead progress from YouTube player
  const handleTimeUpdate = useCallback((time: number, totalDuration: number) => {
    setCurrentTime(time);
    if (totalDuration > 0) {
      setDuration(totalDuration);
    }
  }, []);

  // Direct play/pause within YouTube iframe (if Host/Mod interacted directly)
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

  const leave = useCallback(() => {
    socketService.leaveRoom({ roomCode });
    socketService.disconnect();
  }, [roomCode]);

  return {
    room,
    currentTime,
    duration,
    socketConnected,
    isReconnecting,
    socketError,
    actions: {
      play,
      pause,
      seek,
      changeVideo,
      handleTimeUpdate,
      handleIframePlay,
      handleIframePause,
      leave,
    },
  };
}
