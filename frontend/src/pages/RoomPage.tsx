import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  FiArrowLeft,
  FiUsers,
  FiVideo,
  FiShield,
  FiAlertTriangle,
  FiAlertCircle,
  FiLogIn,
  FiLoader,
} from 'react-icons/fi';
import { roomApiService, AppApiError } from '../services/api';
import { socketService } from '../socket/socket';
import type { SafeRoomDto } from '../types/room.types';
import type { SyncStatePayload } from '../types/socket.types';
import { SOCKET_EVENTS } from '../types/socket.types';
import { validateUsername } from '../utils/roomCode';

export const RoomPage: React.FC = () => {
  const { roomCode } = useParams<{ roomCode: string }>();

  const [room, setRoom] = useState<SafeRoomDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);

  // Direct Link Joining State (when arriving via /room/:roomCode without saved session)
  const [needsJoin, setNeedsJoin] = useState(false);
  const [directUsername, setDirectUsername] = useState('');
  const [directUsernameError, setDirectUsernameError] = useState<string | null>(null);
  const [isDirectJoining, setIsDirectJoining] = useState(false);
  const [directJoinError, setDirectJoinError] = useState<string | null>(null);

  useEffect(() => {
    if (!roomCode) {
      setError('Invalid room code provided in URL');
      setLoading(false);
      return;
    }

    let isMounted = true;

    const checkAndInitRoom = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch room to verify existence
        const safeRoom = await roomApiService.getRoom(roomCode);
        if (!isMounted) return;
        setRoom(safeRoom);

        // Check if user has an existing session in sessionStorage for this room
        const savedUsername = sessionStorage.getItem('watchparty_username');
        const savedUserId = sessionStorage.getItem('watchparty_userId');

        if (!savedUsername || !savedUserId) {
          // User arrived directly via link without joining first
          setNeedsJoin(true);
          setLoading(false);
          return;
        }

        // User already has session credentials; connect socket
        initSocket(safeRoom.roomCode, savedUsername, savedUserId);
      } catch (err: unknown) {
        if (!isMounted) return;
        if (err instanceof AppApiError) {
          setError(err.message);
        } else {
          setError('Failed to load room details. Please verify the room code.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    checkAndInitRoom();

    return () => {
      isMounted = false;
      socketService.disconnect();
    };
  }, [roomCode]);

  const initSocket = (code: string, username: string, userId?: string) => {
    const socket = socketService.connect();

    const handleConnect = () => {
      setSocketConnected(true);
      socketService.joinRoom({
        roomCode: code,
        username,
        userId,
      });
    };

    const handleDisconnect = () => {
      setSocketConnected(false);
    };

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
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    const unsubscribeSync = socketService.on(SOCKET_EVENTS.SYNC_STATE, handleSyncState);

    if (socket.connected) {
      handleConnect();
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      unsubscribeSync();
      socketService.leaveRoom({ roomCode: code });
      socketService.disconnect();
    };
  };

  // Handle direct join form submission
  const handleDirectJoinSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setDirectJoinError(null);

    const validation = validateUsername(directUsername);
    if (!validation.isValid) {
      setDirectUsernameError(validation.error || 'Invalid username');
      return;
    }
    setDirectUsernameError(null);

    if (!roomCode) return;

    try {
      setIsDirectJoining(true);
      const result = await roomApiService.joinRoom(roomCode, {
        username: directUsername.trim(),
      });

      // Save credentials in sessionStorage
      sessionStorage.setItem('watchparty_userId', result.participant.userId);
      sessionStorage.setItem('watchparty_username', result.participant.username);
      sessionStorage.setItem('watchparty_role', result.participant.role);

      setRoom(result.room);
      setNeedsJoin(false);

      // Connect socket
      initSocket(result.room.roomCode, result.participant.username, result.participant.userId);
    } catch (err: unknown) {
      if (err instanceof AppApiError) {
        setDirectJoinError(err.message);
      } else {
        setDirectJoinError('Failed to join room. Please try again.');
      }
    } finally {
      setIsDirectJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-slate-400 text-sm">Connecting to room...</span>
        </div>
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="flex-1 flex items-center justify-center py-16 sm:py-20 px-4">
        <div className="max-w-md w-full bg-slate-800/80 border border-slate-700 rounded-xl p-6 sm:p-8 text-center shadow-sm">
          <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center mx-auto mb-4">
            <FiAlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Room Not Found</h2>
          <p className="text-slate-400 text-xs sm:text-sm mb-6 leading-relaxed">
            {error || 'This watch party room does not exist or may have expired.'}
          </p>
          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium transition-colors"
          >
            <FiArrowLeft className="w-4 h-4" />
            <span>Return to Home</span>
          </Link>
        </div>
      </div>
    );
  }

  // Direct Link Join Prompt: User arrived via /room/:roomCode without an active session
  if (needsJoin) {
    return (
      <div className="flex-1 flex items-center justify-center py-12 sm:py-20 px-4">
        <div className="max-w-md w-full bg-slate-800/80 border border-slate-700 rounded-xl p-6 sm:p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center font-bold">
              <FiLogIn className="w-4 h-4" />
            </div>
            <h2 className="text-xl font-semibold text-white">Join Watch Party</h2>
          </div>
          <p className="text-slate-400 text-xs sm:text-sm mb-5 leading-relaxed">
            You were invited to room <span className="font-mono text-white font-medium">{room.roomCode}</span>. Enter your username to enter the party.
          </p>

          {directJoinError && (
            <div
              role="alert"
              className="mb-4 p-3 rounded-lg bg-red-950/60 border border-red-800/80 text-red-200 text-xs flex items-start gap-2.5"
            >
              <FiAlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
              <span>{directJoinError}</span>
            </div>
          )}

          <form onSubmit={handleDirectJoinSubmit} noValidate aria-label="Join Room Link Form" className="space-y-4">
            <div>
              <label htmlFor="direct-username" className="block text-xs font-medium text-slate-300 mb-1.5">
                Your Username <span className="text-red-400" aria-hidden="true">*</span>
              </label>
              <input
                id="direct-username"
                name="username"
                type="text"
                required
                autoComplete="nickname"
                maxLength={50}
                placeholder="e.g. Charlie"
                value={directUsername}
                onChange={(e) => {
                  setDirectUsername(e.target.value);
                  if (directUsernameError) setDirectUsernameError(null);
                }}
                aria-invalid={!!directUsernameError}
                aria-describedby={directUsernameError ? 'direct-username-error' : undefined}
                className={`w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-850 ${
                  directUsernameError
                    ? 'border-red-500 focus:ring-red-500/50'
                    : 'border-slate-700 focus:border-blue-500 focus:ring-blue-500/30'
                }`}
              />
              {directUsernameError && (
                <p id="direct-username-error" className="mt-1 text-xs text-red-400">
                  {directUsernameError}
                </p>
              )}
            </div>

            <div className="pt-2 flex flex-col gap-2.5">
              <button
                type="submit"
                disabled={isDirectJoining}
                aria-busy={isDirectJoining}
                className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-blue-500 shadow-sm"
              >
                {isDirectJoining ? (
                  <>
                    <FiLoader className="w-4 h-4 animate-spin" />
                    <span>Joining Party...</span>
                  </>
                ) : (
                  <>
                    <FiLogIn className="w-4 h-4" />
                    <span>Enter Watch Party</span>
                  </>
                )}
              </button>

              <Link
                to="/"
                className="w-full py-2 text-center text-xs text-slate-400 hover:text-slate-200 transition-colors"
              >
                Cancel and return to home
              </Link>
            </div>
          </form>
        </div>
      </div>
    );
  }

  const currentUserRole = sessionStorage.getItem('watchparty_role') || 'participant';

  return (
    <div className="flex-1 flex flex-col gap-6">
      {/* Room Header Banner */}
      <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 sm:px-5 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 sm:gap-4">
          <Link
            to="/"
            className="p-2 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-300 transition-colors"
            title="Leave Room"
          >
            <FiArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-base sm:text-lg font-bold text-white tracking-wide font-mono">
                {room.roomCode}
              </h1>
              <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-red-500/20 text-red-400 border border-red-500/30 uppercase">
                {room.playbackState}
              </span>
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
              <span className="font-mono truncate max-w-[120px] sm:max-w-none">Video: {room.currentVideoId}</span>
              <span>•</span>
              <span
                className={`inline-flex items-center gap-1 ${
                  socketConnected ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                {socketConnected ? 'Real-Time Sync Active' : 'Connecting WebSocket...'}
              </span>
            </p>
          </div>
        </div>

        {/* Current User Role Badge */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700/50 border border-slate-600/50 text-xs text-slate-200">
            <FiShield className="w-3.5 h-3.5 text-amber-400" />
            <span className="capitalize">{currentUserRole}</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Player Shell + Participant Shell */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
        {/* Left: YouTube Player Container Shell (2 cols) */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="w-full aspect-video bg-slate-950 border border-slate-800 rounded-xl flex flex-col items-center justify-center p-6 text-center shadow-lg relative overflow-hidden">
            <div className="w-14 h-14 rounded-full bg-red-600/20 text-red-500 flex items-center justify-center mb-3">
              <FiVideo className="w-7 h-7" />
            </div>
            <h3 className="text-base font-medium text-white mb-1">
              Synchronized Video Player Shell
            </h3>
            <p className="text-xs text-slate-400 max-w-sm">
              YouTube IFrame API integration will be mounted here in the next step with server-authoritative sync.
            </p>
            <div className="mt-4 px-3 py-1 rounded bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-400">
              Current Playhead Anchor: {room.playbackTime.toFixed(1)}s
            </div>
          </div>

          {/* Playback Controls Placeholder */}
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 flex items-center justify-between text-xs text-slate-400">
            <span>Playback Controls Shell</span>
            <span className="font-mono text-slate-500">Host / Moderator Authorized</span>
          </div>
        </div>

        {/* Right: Participant List Shell (1 col) */}
        <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-5 flex flex-col">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-700/60">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <FiUsers className="w-4 h-4 text-slate-400" />
              <span>Participants</span>
            </div>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-300 font-mono">
              {room.participants.length}
            </span>
          </div>

          <div className="space-y-2 flex-1 overflow-y-auto max-h-96">
            {room.participants.map((p) => (
              <div
                key={p.userId}
                className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      p.isOnline ? 'bg-emerald-400' : 'bg-slate-500'
                    }`}
                  />
                  <span className="font-medium text-white">{p.username}</span>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-slate-800 text-slate-400">
                  {p.role}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
