import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  FiPlus,
  FiLogIn,
  FiAlertCircle,
  FiLoader,
  FiShield,
  FiZap,
  FiGlobe,
} from 'react-icons/fi';
import { roomApiService, AppApiError } from '../services/api';
import { parseRoomCode, isValidRoomCode, validateUsername } from '../utils/roomCode';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Create Form State
  const [createUsername, setCreateUsername] = useState('');
  const [createUsernameError, setCreateUsernameError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createFormError, setCreateFormError] = useState<string | null>(null);

  // Join Form State
  const [joinUsername, setJoinUsername] = useState('');
  const [joinUsernameError, setJoinUsernameError] = useState<string | null>(null);
  const [joinRoomInput, setJoinRoomInput] = useState('');
  const [joinRoomError, setJoinRoomError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [joinFormError, setJoinFormError] = useState<string | null>(null);

  // Pre-fill room code if provided in query params (e.g. /?room=ABC-XYZ or /?join=ABC-XYZ)
  useEffect(() => {
    const queryRoom = searchParams.get('room') || searchParams.get('join') || searchParams.get('code');
    if (queryRoom) {
      const parsed = parseRoomCode(queryRoom);
      setJoinRoomInput(parsed);
    }
  }, [searchParams]);

  // Handle Create Room
  const handleCreateSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCreateFormError(null);

    // Client-side validation
    const usernameValidation = validateUsername(createUsername);
    if (!usernameValidation.isValid) {
      setCreateUsernameError(usernameValidation.error || 'Invalid username');
      return;
    }
    setCreateUsernameError(null);

    try {
      setIsCreating(true);

      const result = await roomApiService.createRoom({
        username: createUsername.trim(),
      });

      // Persist session in sessionStorage for seamless room entry
      sessionStorage.setItem('watchparty_userId', result.hostUser.userId);
      sessionStorage.setItem('watchparty_username', result.hostUser.username);
      sessionStorage.setItem('watchparty_role', result.hostUser.role);

      navigate(`/room/${result.room.roomCode}`);
    } catch (err: unknown) {
      if (err instanceof AppApiError) {
        setCreateFormError(err.message);
      } else {
        setCreateFormError('Failed to create room. Please verify that the server is reachable.');
      }
    } finally {
      setIsCreating(false);
    }
  };

  // Handle Join Room
  const handleJoinSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setJoinFormError(null);

    // Client-side validation: username
    const usernameValidation = validateUsername(joinUsername);
    if (!usernameValidation.isValid) {
      setJoinUsernameError(usernameValidation.error || 'Invalid username');
      return;
    }
    setJoinUsernameError(null);

    // Client-side validation: room code / link
    const parsedCode = parseRoomCode(joinRoomInput);
    if (!isValidRoomCode(parsedCode)) {
      setJoinRoomError('Please enter a valid 6-character room code (e.g. ABC-XYZ) or room link.');
      return;
    }
    setJoinRoomError(null);

    try {
      setIsJoining(true);

      const result = await roomApiService.joinRoom(parsedCode, {
        username: joinUsername.trim(),
      });

      // Persist session
      sessionStorage.setItem('watchparty_userId', result.participant.userId);
      sessionStorage.setItem('watchparty_username', result.participant.username);
      sessionStorage.setItem('watchparty_role', result.participant.role);

      navigate(`/room/${result.room.roomCode}`);
    } catch (err: unknown) {
      if (err instanceof AppApiError) {
        setJoinFormError(err.message);
      } else {
        setJoinFormError('Failed to join room. Please check the room code.');
      }
    } finally {
      setIsJoining(false);
    }
  };

  // Auto-format room code on change
  const handleRoomInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setJoinRoomInput(raw);
    if (joinRoomError) setJoinRoomError(null);
  };

  const handleRoomInputBlur = () => {
    if (joinRoomInput.trim()) {
      const parsed = parseRoomCode(joinRoomInput);
      setJoinRoomInput(parsed);
      if (!isValidRoomCode(parsed)) {
        setJoinRoomError('Room code should be in format XXX-XXX (e.g. ABC-XYZ)');
      } else {
        setJoinRoomError(null);
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col justify-center items-center py-6 sm:py-10 md:py-12 w-full animate-in fade-in duration-300">
      <div className="w-full max-w-4xl mx-auto flex flex-col gap-8 sm:gap-12">
        {/* Header Hero Section */}
        <div className="text-center flex flex-col items-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 text-slate-300 text-xs font-medium mb-4 border border-slate-700/60 shadow-sm backdrop-blur-xs">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="tracking-wide">Server-Authoritative Synchronization</span>
          </div>

          <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-white mb-4 leading-tight">
            Watch YouTube Together,{' '}
            <span className="bg-gradient-to-r from-red-400 via-rose-400 to-amber-300 bg-clip-text text-transparent">
              Anywhere.
            </span>
          </h1>

          <p className="text-slate-400 text-sm sm:text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
            Real-time synchronized video playback with authoritative playback controls, role permissions, and instant request approvals.
          </p>
        </div>

        {/* Action Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
          {/* Card 1: Create Watch Party */}
          <div className="bg-slate-900/70 backdrop-blur-md border border-slate-800 hover:border-slate-700/80 rounded-2xl p-6 sm:p-8 flex flex-col justify-between shadow-xl shadow-black/20 transition-all duration-200">
            <div>
              <div className="flex items-center gap-3.5 mb-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500/20 to-rose-500/10 border border-red-500/20 text-red-400 flex items-center justify-center font-bold shadow-xs">
                  <FiPlus className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">Create Watch Party</h2>
                  <span className="text-[11px] text-red-400 font-medium uppercase tracking-wider">Host Access</span>
                </div>
              </div>

              <p className="text-slate-400 text-xs sm:text-sm mb-6 leading-relaxed">
                Create a new private room as the Host with full administrative playback controls and participant management.
              </p>

              {createFormError && (
                <div
                  role="alert"
                  className="mb-5 p-3.5 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-200 text-xs flex items-start gap-2.5 shadow-xs"
                >
                  <FiAlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                  <span className="leading-relaxed">{createFormError}</span>
                </div>
              )}

              <form onSubmit={handleCreateSubmit} noValidate aria-label="Create Watch Party Form" className="space-y-4">
                <div>
                  <label htmlFor="create-username" className="block text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wider">
                    Your Username <span className="text-red-400" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="create-username"
                    name="username"
                    type="text"
                    required
                    autoComplete="nickname"
                    maxLength={50}
                    placeholder="e.g. Alice"
                    value={createUsername}
                    onChange={(e) => {
                      setCreateUsername(e.target.value);
                      if (createUsernameError) setCreateUsernameError(null);
                    }}
                    aria-invalid={!!createUsernameError}
                    aria-describedby={createUsernameError ? 'create-username-error' : undefined}
                    className={`w-full h-11 px-4 rounded-xl bg-slate-950/70 border text-white placeholder-slate-500 text-sm transition-all focus:outline-none focus:ring-2 ${
                      createUsernameError
                        ? 'border-rose-500 focus:ring-rose-500/40'
                        : 'border-slate-800 focus:border-red-500 focus:ring-red-500/30'
                    }`}
                  />
                  {createUsernameError && (
                    <p id="create-username-error" className="mt-1.5 text-xs text-rose-400 flex items-center gap-1 font-medium">
                      <FiAlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{createUsernameError}</span>
                    </p>
                  )}
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isCreating}
                    aria-busy={isCreating}
                    className="w-full h-11 px-5 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 active:scale-[0.99] disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 shadow-md shadow-red-950/30 cursor-pointer"
                  >
                    {isCreating ? (
                      <>
                        <FiLoader className="w-4 h-4 animate-spin text-white" />
                        <span>Creating Room...</span>
                      </>
                    ) : (
                      <>
                        <FiPlus className="w-4 h-4 text-white" />
                        <span>Create Watch Party</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Card 2: Join Watch Party */}
          <div className="bg-slate-900/70 backdrop-blur-md border border-slate-800 hover:border-slate-700/80 rounded-2xl p-6 sm:p-8 flex flex-col justify-between shadow-xl shadow-black/20 transition-all duration-200">
            <div>
              <div className="flex items-center gap-3.5 mb-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center font-bold shadow-xs">
                  <FiLogIn className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">Join Watch Party</h2>
                  <span className="text-[11px] text-blue-400 font-medium uppercase tracking-wider">Participant Access</span>
                </div>
              </div>

              <p className="text-slate-400 text-xs sm:text-sm mb-6 leading-relaxed">
                Enter an existing 6-character room code or paste a shared party invite link to connect with friends.
              </p>

              {joinFormError && (
                <div
                  role="alert"
                  className="mb-5 p-3.5 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-200 text-xs flex items-start gap-2.5 shadow-xs"
                >
                  <FiAlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                  <span className="leading-relaxed">{joinFormError}</span>
                </div>
              )}

              <form onSubmit={handleJoinSubmit} noValidate aria-label="Join Watch Party Form" className="space-y-4">
                <div>
                  <label htmlFor="join-room-code" className="block text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wider">
                    Room Code or Link <span className="text-red-400" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="join-room-code"
                    name="roomCode"
                    type="text"
                    required
                    placeholder="e.g. ABC-XYZ or /room/ABC-XYZ"
                    value={joinRoomInput}
                    onChange={handleRoomInputChange}
                    onBlur={handleRoomInputBlur}
                    aria-invalid={!!joinRoomError}
                    aria-describedby={joinRoomError ? 'join-room-error' : undefined}
                    className={`w-full h-11 px-4 rounded-xl bg-slate-950/70 border text-white placeholder-slate-500 text-sm font-mono tracking-wider uppercase transition-all focus:outline-none focus:ring-2 ${
                      joinRoomError
                        ? 'border-rose-500 focus:ring-rose-500/40'
                        : 'border-slate-800 focus:border-blue-500 focus:ring-blue-500/30'
                    }`}
                  />
                  {joinRoomError && (
                    <p id="join-room-error" className="mt-1.5 text-xs text-rose-400 flex items-center gap-1 font-medium">
                      <FiAlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{joinRoomError}</span>
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="join-username" className="block text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wider">
                    Your Username <span className="text-red-400" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="join-username"
                    name="username"
                    type="text"
                    required
                    autoComplete="nickname"
                    maxLength={50}
                    placeholder="e.g. Bob"
                    value={joinUsername}
                    onChange={(e) => {
                      setJoinUsername(e.target.value);
                      if (joinUsernameError) setJoinUsernameError(null);
                    }}
                    aria-invalid={!!joinUsernameError}
                    aria-describedby={joinUsernameError ? 'join-username-error' : undefined}
                    className={`w-full h-11 px-4 rounded-xl bg-slate-950/70 border text-white placeholder-slate-500 text-sm transition-all focus:outline-none focus:ring-2 ${
                      joinUsernameError
                        ? 'border-rose-500 focus:ring-rose-500/40'
                        : 'border-slate-800 focus:border-blue-500 focus:ring-blue-500/30'
                    }`}
                  />
                  {joinUsernameError && (
                    <p id="join-username-error" className="mt-1.5 text-xs text-rose-400 flex items-center gap-1 font-medium">
                      <FiAlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{joinUsernameError}</span>
                    </p>
                  )}
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isJoining}
                    aria-busy={isJoining}
                    className="w-full h-11 px-5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-[0.99] disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 shadow-md shadow-blue-950/30 cursor-pointer"
                  >
                    {isJoining ? (
                      <>
                        <FiLoader className="w-4 h-4 animate-spin text-white" />
                        <span>Joining Room...</span>
                      </>
                    ) : (
                      <>
                        <FiLogIn className="w-4 h-4 text-white" />
                        <span>Join Watch Party</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        {/* Professional Feature Pills */}
        <div className="pt-4 border-t border-slate-800/60 grid grid-cols-1 sm:grid-cols-3 gap-4 text-slate-400 text-xs">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/40 border border-slate-800/40">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
              <FiZap className="w-4 h-4" />
            </div>
            <div>
              <p className="font-semibold text-slate-200">Sub-Second Sync</p>
              <p className="text-[11px] text-slate-400">Zero playback drift or echo loops</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/40 border border-slate-800/40">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
              <FiShield className="w-4 h-4" />
            </div>
            <div>
              <p className="font-semibold text-slate-200">Role-Based Access</p>
              <p className="text-[11px] text-slate-400">Host, Moderator & Requests</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/40 border border-slate-800/40">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
              <FiGlobe className="w-4 h-4" />
            </div>
            <div>
              <p className="font-semibold text-slate-200">Instant Sharing</p>
              <p className="text-[11px] text-slate-400">No browser extension needed</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
