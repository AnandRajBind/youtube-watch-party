import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FiArrowLeft, FiUsers, FiVideo, FiShield, FiAlertTriangle } from 'react-icons/fi';
import { roomApiService, AppApiError } from '../services/api';
import { socketService } from '../socket/socket';
import type { SafeRoomDto } from '../types/room.types';
import type { SyncStatePayload } from '../types/socket.types';
import { SOCKET_EVENTS } from '../types/socket.types';

export const RoomPage: React.FC = () => {
  const { roomCode } = useParams<{ roomCode: string }>();

  const [room, setRoom] = useState<SafeRoomDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);

  useEffect(() => {
    if (!roomCode) {
      setError('Invalid room code');
      setLoading(false);
      return;
    }

    let isMounted = true;

    // 1. Fetch initial safe room details via REST API
    const loadRoom = async () => {
      try {
        setLoading(true);
        setError(null);

        const safeRoom = await roomApiService.getRoom(roomCode);
        if (!isMounted) return;
        setRoom(safeRoom);

        // 2. Initialize Socket.IO connection
        const socket = socketService.connect();

        const handleConnect = () => {
          if (!isMounted) return;
          setSocketConnected(true);

          const username = sessionStorage.getItem('watchparty_username') || 'Anonymous';
          const userId = sessionStorage.getItem('watchparty_userId') || undefined;

          // Join room over WebSocket
          socketService.joinRoom({
            roomCode: safeRoom.roomCode,
            username,
            userId,
          });
        };

        const handleDisconnect = () => {
          if (!isMounted) return;
          setSocketConnected(false);
        };

        const handleSyncState = (data: SyncStatePayload) => {
          if (!isMounted) return;
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
          socketService.leaveRoom({ roomCode: safeRoom.roomCode });
          socketService.disconnect();
        };
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

    loadRoom();

    return () => {
      isMounted = false;
      socketService.disconnect();
    };
  }, [roomCode]);

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
      <div className="flex-1 flex items-center justify-center py-20">
        <div className="max-w-md w-full bg-slate-800/80 border border-slate-700 rounded-xl p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center mx-auto mb-4">
            <FiAlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Room Error</h2>
          <p className="text-slate-400 text-sm mb-6">{error || 'Room could not be loaded.'}</p>
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

  const currentUserRole = sessionStorage.getItem('watchparty_role') || 'participant';

  return (
    <div className="flex-1 flex flex-col gap-6">
      {/* Room Header Banner */}
      <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl px-5 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            to="/"
            className="p-2 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-300 transition-colors"
            title="Leave Room"
          >
            <FiArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-bold text-white tracking-wide font-mono">
                {room.roomCode}
              </h1>
              <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-red-500/20 text-red-400 border border-red-500/30 uppercase">
                {room.playbackState}
              </span>
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
              <span className="font-mono">Video: {room.currentVideoId}</span>
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
