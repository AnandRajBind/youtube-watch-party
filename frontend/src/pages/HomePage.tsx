import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FiPlus, FiLogIn, FiAlertCircle, FiLoader } from 'react-icons/fi';
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
    <div className="flex-1 flex flex-col justify-center items-center py-4 sm:py-8 w-full">
      <div className="w-full max-w-4xl mx-auto">
        {/* Header Hero Section */}
        <div className="text-center mb-8 sm:mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800 text-slate-300 text-xs font-medium mb-3 border border-slate-700">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            Server-Authoritative Watch Party
          </div>
          <h1 className="text-2xl sm:text-4xl md:text-5xl font-bold tracking-tight text-white mb-3">
            Watch YouTube Together
          </h1>
          <p className="text-slate-400 text-xs sm:text-base max-w-xl mx-auto leading-relaxed">
            Real-time synchronized video playback with authoritative controls, role permissions, and instant request approvals.
          </p>
        </div>

        {/* Action Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
          {/* Form 1: Create Watch Party */}
          <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-5 sm:p-7 flex flex-col justify-between shadow-sm">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center font-bold">
                  <FiPlus className="w-4 h-4" />
                </div>
                <h2 className="text-lg sm:text-xl font-semibold text-white">Create Watch Party</h2>
              </div>
              <p className="text-slate-400 text-xs sm:text-sm mb-5 leading-normal">
                Start a new watch party as the room Host with administrative and playback permissions.
              </p>

              {createFormError && (
                <div
                  role="alert"
                  className="mb-4 p-3 rounded-lg bg-red-950/60 border border-red-800/80 text-red-200 text-xs flex items-start gap-2.5"
                >
                  <FiAlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                  <span>{createFormError}</span>
                </div>
              )}

              <form onSubmit={handleCreateSubmit} noValidate aria-label="Create Watch Party Form" className="space-y-4">
                <div>
                  <label htmlFor="create-username" className="block text-xs font-medium text-slate-300 mb-1.5">
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
                    className={`w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-850 ${
                      createUsernameError
                        ? 'border-red-500 focus:ring-red-500/50'
                        : 'border-slate-700 focus:border-red-500 focus:ring-red-500/30'
                    }`}
                  />
                  {createUsernameError && (
                    <p id="create-username-error" className="mt-1 text-xs text-red-400">
                      {createUsernameError}
                    </p>
                  )}
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isCreating}
                    aria-busy={isCreating}
                    className="w-full py-2.5 px-4 rounded-lg bg-red-600 hover:bg-red-500 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-red-500 shadow-sm"
                  >
                    {isCreating ? (
                      <>
                        <FiLoader className="w-4 h-4 animate-spin" />
                        <span>Creating Party...</span>
                      </>
                    ) : (
                      <>
                        <FiPlus className="w-4 h-4" />
                        <span>Create Watch Party</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Form 2: Join Watch Party */}
          <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-5 sm:p-7 flex flex-col justify-between shadow-sm">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center font-bold">
                  <FiLogIn className="w-4 h-4" />
                </div>
                <h2 className="text-lg sm:text-xl font-semibold text-white">Join Watch Party</h2>
              </div>
              <p className="text-slate-400 text-xs sm:text-sm mb-5 leading-normal">
                Enter an existing room code or paste a shared party link to join your friends.
              </p>

              {joinFormError && (
                <div
                  role="alert"
                  className="mb-4 p-3 rounded-lg bg-red-950/60 border border-red-800/80 text-red-200 text-xs flex items-start gap-2.5"
                >
                  <FiAlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                  <span>{joinFormError}</span>
                </div>
              )}

              <form onSubmit={handleJoinSubmit} noValidate aria-label="Join Watch Party Form" className="space-y-4">
                <div>
                  <label htmlFor="join-room-code" className="block text-xs font-medium text-slate-300 mb-1.5">
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
                    className={`w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border text-white placeholder-slate-500 text-sm font-mono tracking-wide uppercase focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-850 ${
                      joinRoomError
                        ? 'border-red-500 focus:ring-red-500/50'
                        : 'border-slate-700 focus:border-blue-500 focus:ring-blue-500/30'
                    }`}
                  />
                  {joinRoomError && (
                    <p id="join-room-error" className="mt-1 text-xs text-red-400">
                      {joinRoomError}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="join-username" className="block text-xs font-medium text-slate-300 mb-1.5">
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
                    className={`w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-850 ${
                      joinUsernameError
                        ? 'border-red-500 focus:ring-red-500/50'
                        : 'border-slate-700 focus:border-blue-500 focus:ring-blue-500/30'
                    }`}
                  />
                  {joinUsernameError && (
                    <p id="join-username-error" className="mt-1 text-xs text-red-400">
                      {joinUsernameError}
                    </p>
                  )}
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isJoining}
                    aria-busy={isJoining}
                    className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-blue-500 shadow-sm"
                  >
                    {isJoining ? (
                      <>
                        <FiLoader className="w-4 h-4 animate-spin" />
                        <span>Joining Party...</span>
                      </>
                    ) : (
                      <>
                        <FiLogIn className="w-4 h-4" />
                        <span>Join Watch Party</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
