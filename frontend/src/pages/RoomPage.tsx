import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  FiArrowLeft,
  FiAlertTriangle,
  FiLogIn,
  FiLoader,
  FiAlertCircle,
  FiRefreshCw,
  FiUsers,
  FiSearch,
  FiWifiOff,
  FiUserX,
  FiPlus,
} from 'react-icons/fi';
import { roomApiService, AppApiError } from '../services/api';
import type { SafeRoomDto, Role } from '../types/room.types';
import { validateUsername } from '../utils/roomCode';
import { permissions } from '../utils/permissions';

import { RoomHeader } from '../components/room/RoomHeader';
import { YouTubePlayer, type YouTubePlayerHandle } from '../components/room/YouTubePlayer';
import { PlaybackControls } from '../components/room/PlaybackControls';
import { VideoUrlInput } from '../components/room/VideoUrlInput';
import { ParticipantsPanel } from '../components/room/ParticipantsPanel';
import { ParticipantRequestModal } from '../components/room/ParticipantRequestModal';
import { PendingRequestsQueue } from '../components/room/PendingRequestsQueue';
import { NotificationToast } from '../components/common/NotificationToast';
import { useWatchPartySocket } from '../hooks/useWatchPartySocket';

export const RoomPage: React.FC = () => {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();

  // Imperative handle to control YouTube player
  const playerRef = useRef<YouTubePlayerHandle>(null);

  // Initial REST loading & session state
  const [initialRoom, setInitialRoom] = useState<SafeRoomDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryTrigger, setRetryTrigger] = useState(0);

  // Current User Session
  const [currentUsername, setCurrentUsername] = useState(
    () => sessionStorage.getItem('watchparty_username') || ''
  );
  const [currentUserId, setCurrentUserId] = useState(
    () => sessionStorage.getItem('watchparty_userId') || ''
  );
  const [currentRole, setCurrentRole] = useState<Role>(
    () => (sessionStorage.getItem('watchparty_role') as Role) || 'participant'
  );

  // Direct Link Joining State (when arriving via /room/:roomCode without saved session)
  const [needsJoin, setNeedsJoin] = useState(false);
  const [directUsername, setDirectUsername] = useState('');
  const [directUsernameError, setDirectUsernameError] = useState<string | null>(null);
  const [isDirectJoining, setIsDirectJoining] = useState(false);
  const [directJoinError, setDirectJoinError] = useState<string | null>(null);

  // Mobile Participants Drawer State
  const [isMobileParticipantsOpen, setIsMobileParticipantsOpen] = useState(false);

  // Participant Request Modal State
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);

  // Kicked Notification Modal
  const [removedNotice, setRemovedNotice] = useState<string | null>(null);

  const handleRoleUpdate = useCallback((newRole: Role) => {
    setCurrentRole(newRole);
    sessionStorage.setItem('watchparty_role', newRole);
  }, []);

  const handleRemovedByHost = useCallback((reason?: string) => {
    setRemovedNotice(reason || 'You have been removed from this room by the Host.');
  }, []);

  // Real-Time Socket.IO Synchronization Hook
  const {
    room,
    currentTime,
    duration,
    socketConnected,
    isReconnecting,
    actionRequests,
    notifications,
    hasPendingRequest,
    removeNotification,
    actions,
  } = useWatchPartySocket({
    roomCode: roomCode || '',
    username: currentUsername,
    userId: currentUserId,
    initialRoom,
    playerRef,
    currentRole,
    onRoleUpdate: handleRoleUpdate,
    onRemovedByHost: handleRemovedByHost,
  });

  const isHost = permissions.isHost(currentRole);
  const isHostOrMod = permissions.canControlPlayback(currentRole);
  const canApprove = permissions.canApproveRequests(currentRole);

  // Fetch initial room via REST API
  useEffect(() => {
    if (!roomCode) {
      setError('Invalid room code provided in URL');
      setLoading(false);
      return;
    }

    let isMounted = true;

    const fetchRoom = async () => {
      try {
        setLoading(true);
        setError(null);

        const safeRoom = await roomApiService.getRoom(roomCode);
        if (!isMounted) return;
        setInitialRoom(safeRoom);

        const savedUsername = sessionStorage.getItem('watchparty_username');
        const savedUserId = sessionStorage.getItem('watchparty_userId');

        if (!savedUsername || !savedUserId) {
          setNeedsJoin(true);
          setLoading(false);
          return;
        }

        setCurrentUsername(savedUsername);
        setCurrentUserId(savedUserId);

        const myParticipant = safeRoom.participants.find((p) => p.userId === savedUserId);
        if (myParticipant) {
          setCurrentRole(myParticipant.role);
          sessionStorage.setItem('watchparty_role', myParticipant.role);
        }
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

    fetchRoom();

    return () => {
      isMounted = false;
    };
  }, [roomCode, retryTrigger]);

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

      setCurrentUserId(result.participant.userId);
      setCurrentUsername(result.participant.username);
      setCurrentRole(result.participant.role);

      setInitialRoom(result.room);
      setNeedsJoin(false);
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

  // 1. Loading View (Skeleton Loading State)
  if (loading) {
    return (
      <div className="flex-1 flex flex-col gap-6 max-w-7xl w-full mx-auto animate-pulse">
        {/* Header Skeleton */}
        <div className="h-20 bg-slate-800/60 rounded-xl border border-slate-700/60 flex items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-700" />
            <div className="w-28 h-5 rounded bg-slate-700" />
          </div>
          <div className="flex gap-2">
            <div className="w-20 h-8 rounded-lg bg-slate-700" />
            <div className="w-24 h-8 rounded-lg bg-slate-700" />
          </div>
        </div>

        {/* Main Content Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 flex flex-col gap-4">
            <div className="aspect-video bg-slate-800/60 rounded-xl border border-slate-700/60 flex flex-col items-center justify-center gap-3">
              <FiLoader className="w-8 h-8 text-red-500 animate-spin" />
              <span className="text-xs text-slate-400">Loading watch party room...</span>
            </div>
            <div className="h-16 bg-slate-800/60 rounded-xl border border-slate-700/60" />
            <div className="h-12 bg-slate-800/60 rounded-xl border border-slate-700/60" />
          </div>
          <div className="hidden lg:block lg:col-span-1 h-96 bg-slate-800/60 rounded-xl border border-slate-700/60" />
        </div>
      </div>
    );
  }

  // 2. Room Not Found & API Error Views
  if (error || (!room && !initialRoom)) {
    const isNotFound =
      (error && (
        error.toLowerCase().includes('not found') ||
        error.toLowerCase().includes('does not exist') ||
        error.toLowerCase().includes('invalid room')
      )) || false;

    if (isNotFound) {
      return (
        <div className="flex-1 flex items-center justify-center py-16 sm:py-20 px-4">
          <div className="max-w-md w-full bg-slate-800/80 border border-slate-700 rounded-xl p-6 sm:p-8 text-center shadow-lg">
            <div className="w-14 h-14 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto mb-4">
              <FiSearch className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Room Not Found</h2>
            <p className="text-slate-300 text-xs sm:text-sm mb-6 leading-relaxed">
              We couldn't find a watch party room with code <span className="font-mono text-white font-semibold">{roomCode}</span>. It may have expired or the link is incorrect.
            </p>
            <div className="flex flex-col sm:flex-row gap-2.5 justify-center">
              <Link
                to="/"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-medium transition-colors"
              >
                <FiPlus className="w-4 h-4" />
                <span>Create Watch Party</span>
              </Link>
              <Link
                to="/"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs sm:text-sm font-medium transition-colors"
              >
                <FiArrowLeft className="w-4 h-4" />
                <span>Return to Home</span>
              </Link>
            </div>
          </div>
        </div>
      );
    }

    // General API / Network Connection Error View
    return (
      <div className="flex-1 flex items-center justify-center py-16 sm:py-20 px-4">
        <div className="max-w-md w-full bg-slate-800/80 border border-slate-700 rounded-xl p-6 sm:p-8 text-center shadow-lg">
          <div className="w-14 h-14 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto mb-4">
            <FiAlertTriangle className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Connection Error</h2>
          <p className="text-slate-300 text-xs sm:text-sm mb-6 leading-relaxed">
            {error || 'Unable to connect to the watch party server. Please check your connection and try again.'}
          </p>
          <div className="flex flex-col sm:flex-row gap-2.5 justify-center">
            <button
              type="button"
              onClick={() => setRetryTrigger((prev) => prev + 1)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs sm:text-sm font-medium transition-colors cursor-pointer"
            >
              <FiRefreshCw className="w-4 h-4" />
              <span>Try Again</span>
            </button>
            <Link
              to="/"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs sm:text-sm font-medium transition-colors"
            >
              <FiArrowLeft className="w-4 h-4" />
              <span>Return to Home</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 3. Participant Removed Screen
  if (removedNotice) {
    return (
      <div className="flex-1 flex items-center justify-center py-16 sm:py-20 px-4">
        <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-xl p-6 sm:p-8 text-center shadow-xl">
          <div className="w-14 h-14 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto mb-4">
            <FiUserX className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Removed from Watch Party</h2>
          <p className="text-slate-300 text-xs sm:text-sm mb-6 leading-relaxed bg-slate-900/60 p-3.5 rounded-lg border border-slate-700/80">
            {removedNotice}
          </p>
          <button
            type="button"
            onClick={() => {
              sessionStorage.clear();
              navigate('/');
            }}
            className="w-full py-2.5 px-4 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 cursor-pointer"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  // Direct Link Join Prompt: User arrived via /room/:roomCode without an active session
  if (needsJoin && initialRoom) {
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
            You were invited to room <span className="font-mono text-white font-medium">{initialRoom.roomCode}</span>. Enter your username to enter the party.
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

  const activeRoom = room || initialRoom!;

  return (
    <div className="flex-1 flex flex-col gap-5 sm:gap-6 w-full max-w-7xl mx-auto overflow-x-hidden relative">
      {/* Unified Toast Notifications System */}
      <NotificationToast
        notifications={notifications}
        onDismiss={removeNotification}
      />

      {/* 1. Room Header (Room code, Room link, Current user, Current role, Participant count) */}
      <RoomHeader
        roomCode={activeRoom.roomCode}
        currentUser={currentUsername}
        currentRole={currentRole}
        participantCount={activeRoom.participants.length}
        socketConnected={socketConnected}
        isReconnecting={isReconnecting}
        onReconnect={actions.reconnect}
        onOpenParticipants={() => setIsMobileParticipantsOpen(true)}
      />

      {/* Socket Connection Status Banners */}
      {isReconnecting && (
        <div
          role="status"
          className="p-3 rounded-xl bg-amber-950/70 border border-amber-800 text-amber-200 text-xs flex items-center justify-between shadow-xs"
        >
          <div className="flex items-center gap-2">
            <FiRefreshCw className="w-4 h-4 shrink-0 text-amber-400 animate-spin" />
            <span>Reconnecting to Watch Party server...</span>
          </div>
          <span className="text-[11px] text-amber-400/90 font-mono">Auto-syncing</span>
        </div>
      )}

      {!socketConnected && !isReconnecting && (
        <div
          role="alert"
          className="p-3 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-200 text-xs flex items-center justify-between shadow-xs"
        >
          <div className="flex items-center gap-2">
            <FiWifiOff className="w-4 h-4 shrink-0 text-rose-400" />
            <span>Disconnected from server. Real-time playback synchronization is paused.</span>
          </div>
          <button
            type="button"
            onClick={actions.reconnect}
            className="px-2.5 py-1 rounded-md bg-rose-800 hover:bg-rose-700 text-white font-medium text-xs transition-colors shrink-0 cursor-pointer"
          >
            Reconnect Now
          </button>
        </div>
      )}

      {/* Host & Moderator Pending Change Requests Queue */}
      {canApprove && (
        <PendingRequestsQueue
          requests={actionRequests}
          isHostOrMod={canApprove}
          onApprove={actions.approveRequest}
          onReject={actions.rejectRequest}
        />
      )}

      {/* 2. Main Watch Room Layout (Desktop: 2/3 Player + 1/3 Sidebar; Mobile: Stacked Video First) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6 flex-1 items-start">
        {/* Main Column: YouTube Player + Controls + Video URL Input */}
        <div className="lg:col-span-2 flex flex-col gap-4 w-full">
          {/* A. YouTube Player (Video First on Mobile) */}
          <YouTubePlayer
            ref={playerRef}
            videoId={activeRoom.currentVideoId}
            isHostOrMod={isHostOrMod}
            onLocalPlay={actions.handleIframePlay}
            onLocalPause={actions.handleIframePause}
            onTimeUpdate={actions.handleTimeUpdate}
          />

          {/* B. Playback Controls */}
          <PlaybackControls
            playbackState={activeRoom.playbackState}
            currentTime={currentTime}
            duration={duration}
            isHostOrMod={isHostOrMod}
            hasPendingRequest={hasPendingRequest}
            onPlay={actions.play}
            onPause={actions.pause}
            onSeek={actions.seek}
            onRequestControl={() => setIsRequestModalOpen(true)}
          />

          {/* C. Video URL / Input Area */}
          <VideoUrlInput
            currentVideoId={activeRoom.currentVideoId}
            isHostOrMod={isHostOrMod}
            onChangeVideo={actions.changeVideo}
            onRequestChangeVideo={(vid) =>
              actions.submitActionRequest('change_video', { videoId: vid })
            }
          />

          {/* D. Mobile Participants Trigger Banner */}
          <div className="lg:hidden bg-slate-800/80 border border-slate-700 rounded-xl p-3.5 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-slate-700/60 flex items-center justify-center shrink-0">
                <FiUsers className="w-4 h-4 text-blue-400" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-semibold text-white">Participants</h3>
                  <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">
                    {activeRoom.participants.length}
                  </span>
                </div>
                <p className="text-[11px] text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>{activeRoom.participants.filter((p) => p.isOnline).length} online</span>
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsMobileParticipantsOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors shrink-0 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              View Panel
            </button>
          </div>
        </div>

        {/* Sidebar Column: Participants Panel on Desktop */}
        <div className="hidden lg:flex lg:col-span-1 w-full flex-col">
          <ParticipantsPanel
            participants={activeRoom.participants}
            currentUserId={currentUserId}
            isHost={isHost}
            onAssignRole={actions.assignRole}
            onRemoveParticipant={actions.removeParticipant}
            onTransferHost={actions.transferHost}
          />
        </div>
      </div>

      {/* Mobile Drawer (Slide-over sheet on small screens) */}
      <ParticipantsPanel
        isDrawer={true}
        isOpen={isMobileParticipantsOpen}
        onClose={() => setIsMobileParticipantsOpen(false)}
        participants={activeRoom.participants}
        currentUserId={currentUserId}
        isHost={isHost}
        onAssignRole={actions.assignRole}
        onRemoveParticipant={actions.removeParticipant}
        onTransferHost={actions.transferHost}
      />

      {/* Participant Request Modal Dialog */}
      <ParticipantRequestModal
        isOpen={isRequestModalOpen}
        onClose={() => setIsRequestModalOpen(false)}
        currentTime={currentTime}
        duration={duration}
        currentVideoId={activeRoom.currentVideoId}
        onSubmitRequest={actions.submitActionRequest}
      />
    </div>
  );
};
