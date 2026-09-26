import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiPlus, FiLogIn, FiAlertCircle } from 'react-icons/fi';
import { roomApiService, AppApiError } from '../services/api';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();

  // Create Room Form State
  const [createUsername, setCreateUsername] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Join Room Form State
  const [joinUsername, setJoinUsername] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createUsername.trim()) {
      setCreateError('Please enter a display username.');
      return;
    }

    try {
      setIsCreating(true);
      setCreateError(null);

      const result = await roomApiService.createRoom({
        username: createUsername.trim(),
        initialVideoUrl: videoUrl.trim() || undefined,
      });

      // Save user session in sessionStorage for smooth room entry
      sessionStorage.setItem('watchparty_userId', result.hostUser.userId);
      sessionStorage.setItem('watchparty_username', result.hostUser.username);
      sessionStorage.setItem('watchparty_role', result.hostUser.role);

      navigate(`/room/${result.room.roomCode}`);
    } catch (err: unknown) {
      if (err instanceof AppApiError) {
        setCreateError(err.message);
      } else {
        setCreateError('Failed to create room. Please verify the server is running.');
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinUsername.trim()) {
      setJoinError('Please enter a display username.');
      return;
    }
    if (!roomCode.trim()) {
      setJoinError('Please enter a room code.');
      return;
    }

    try {
      setIsJoining(true);
      setJoinError(null);

      const cleanCode = roomCode.trim().toUpperCase();
      const result = await roomApiService.joinRoom(cleanCode, {
        username: joinUsername.trim(),
      });

      // Save user session
      sessionStorage.setItem('watchparty_userId', result.participant.userId);
      sessionStorage.setItem('watchparty_username', result.participant.username);
      sessionStorage.setItem('watchparty_role', result.participant.role);

      navigate(`/room/${result.room.roomCode}`);
    } catch (err: unknown) {
      if (err instanceof AppApiError) {
        setJoinError(err.message);
      } else {
        setJoinError('Failed to join room. Please check the room code.');
      }
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col justify-center items-center py-6">
      <div className="w-full max-w-4xl">
        {/* Hero Section */}
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-white mb-3">
            Watch YouTube Together in Real-Time
          </h1>
          <p className="text-slate-400 text-sm sm:text-base max-w-xl mx-auto">
            Synchronized playback with sub-second accuracy, role-based controls, and instant participant approvals.
          </p>
        </div>

        {/* Action Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
          {/* Card 1: Create a Room */}
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-6 sm:p-8 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg bg-red-500/20 text-red-400 flex items-center justify-center font-bold">
                  <FiPlus className="w-4 h-4" />
                </div>
                <h2 className="text-xl font-semibold text-white">Create a Room</h2>
              </div>
              <p className="text-slate-400 text-xs sm:text-sm mb-6">
                Host a session. As the host, you have full control over playback and moderation.
              </p>

              {createError && (
                <div className="mb-4 p-3 rounded-lg bg-red-950/50 border border-red-800/60 text-red-300 text-xs flex items-center gap-2">
                  <FiAlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{createError}</span>
                </div>
              )}

              <form onSubmit={handleCreateRoom} className="space-y-4">
                <div>
                  <label htmlFor="create-username" className="block text-xs font-medium text-slate-300 mb-1.5">
                    Your Username <span className="text-red-400">*</span>
                  </label>
                  <input
                    id="create-username"
                    type="text"
                    required
                    placeholder="e.g. Alice"
                    value={createUsername}
                    onChange={(e) => setCreateUsername(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-500"
                  />
                </div>

                <div>
                  <label htmlFor="create-video-url" className="block text-xs font-medium text-slate-300 mb-1.5">
                    Initial YouTube Video URL <span className="text-slate-500 font-normal">(optional)</span>
                  </label>
                  <input
                    id="create-video-url"
                    type="url"
                    placeholder="https://www.youtube.com/watch?v=..."
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isCreating}
                  className="w-full mt-2 py-2.5 px-4 rounded-lg bg-red-600 hover:bg-red-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors flex items-center justify-center gap-2 shadow-sm"
                >
                  <FiPlus className="w-4 h-4" />
                  <span>{isCreating ? 'Creating Room...' : 'Create Watch Party'}</span>
                </button>
              </form>
            </div>
          </div>

          {/* Card 2: Join a Room */}
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-6 sm:p-8 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold">
                  <FiLogIn className="w-4 h-4" />
                </div>
                <h2 className="text-xl font-semibold text-white">Join a Room</h2>
              </div>
              <p className="text-slate-400 text-xs sm:text-sm mb-6">
                Enter an existing watch party room code shared with you by a host.
              </p>

              {joinError && (
                <div className="mb-4 p-3 rounded-lg bg-red-950/50 border border-red-800/60 text-red-300 text-xs flex items-center gap-2">
                  <FiAlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{joinError}</span>
                </div>
              )}

              <form onSubmit={handleJoinRoom} className="space-y-4">
                <div>
                  <label htmlFor="join-room-code" className="block text-xs font-medium text-slate-300 mb-1.5">
                    Room Code <span className="text-red-400">*</span>
                  </label>
                  <input
                    id="join-room-code"
                    type="text"
                    required
                    placeholder="e.g. ABC-XYZ"
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 text-sm uppercase tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label htmlFor="join-username" className="block text-xs font-medium text-slate-300 mb-1.5">
                    Your Username <span className="text-red-400">*</span>
                  </label>
                  <input
                    id="join-username"
                    type="text"
                    required
                    placeholder="e.g. Bob"
                    value={joinUsername}
                    onChange={(e) => setJoinUsername(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isJoining}
                  className="w-full mt-2 py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors flex items-center justify-center gap-2 shadow-sm"
                >
                  <FiLogIn className="w-4 h-4" />
                  <span>{isJoining ? 'Joining Room...' : 'Join Watch Party'}</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
