import React from 'react';
import {
  FiPlay,
  FiPause,
  FiRotateCcw,
  FiRotateCw,
  FiRadio,
  FiSend,
} from 'react-icons/fi';
import { formatPlaybackTime } from '../../utils/youtube';

interface PlaybackControlsProps {
  playbackState: 'playing' | 'paused';
  currentTime: number;
  duration: number;
  isHostOrMod: boolean;
  hasPendingRequest?: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (seconds: number) => void;
  onRequestControl?: () => void;
}

export const PlaybackControls: React.FC<PlaybackControlsProps> = ({
  playbackState,
  currentTime,
  duration,
  isHostOrMod,
  hasPendingRequest = false,
  onPlay,
  onPause,
  onSeek,
  onRequestControl,
}) => {
  const handleTogglePlay = () => {
    if (!isHostOrMod) return;
    if (playbackState === 'playing') {
      onPause();
    } else {
      onPlay();
    }
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isHostOrMod) return;
    const targetSeconds = parseFloat(e.target.value);
    onSeek(targetSeconds);
  };

  const handleSkip = (deltaSeconds: number) => {
    if (!isHostOrMod) return;
    const nextTime = Math.max(0, Math.min(duration || Infinity, currentTime + deltaSeconds));
    onSeek(nextTime);
  };

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="bg-slate-900/70 backdrop-blur-md border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl shadow-black/20 flex flex-col gap-3.5">
      {/* Progress Bar (Scrubber) */}
      <div className="flex flex-col gap-1.5 w-full">
        <div className="relative w-full flex items-center py-1">
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.5}
            value={currentTime}
            onChange={handleSliderChange}
            disabled={!isHostOrMod}
            aria-label="Video scrubber"
            className={`w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500/40 accent-red-600 transition-all ${
              !isHostOrMod ? 'cursor-default pointer-events-none opacity-80' : ''
            }`}
            style={{
              background: `linear-gradient(to right, #dc2626 0%, #dc2626 ${progressPercentage}%, #1e293b ${progressPercentage}%, #1e293b 100%)`,
            }}
          />
        </div>

        {/* Timestamps */}
        <div className="flex items-center justify-between text-xs font-mono text-slate-400 select-none px-0.5">
          <span className="text-slate-300 font-medium">{formatPlaybackTime(currentTime)}</span>
          <span>{formatPlaybackTime(duration)}</span>
        </div>
      </div>

      {/* Control Buttons & Role Indicator */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
        <div className="flex items-center gap-2">
          {/* Play / Pause Toggle */}
          <button
            type="button"
            onClick={handleTogglePlay}
            disabled={!isHostOrMod}
            title={isHostOrMod ? (playbackState === 'playing' ? 'Pause' : 'Play') : 'Viewer mode: synchronized to host'}
            aria-label={playbackState === 'playing' ? 'Pause video' : 'Play video'}
            className={`w-10 h-10 rounded-xl flex items-center justify-center text-white transition-all shadow-md focus:outline-none focus-visible:ring-2 active:scale-95 ${
              isHostOrMod
                ? 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 shadow-red-950/30 focus-visible:ring-red-500 cursor-pointer'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-60 border border-slate-700/50'
            }`}
          >
            {playbackState === 'playing' ? <FiPause className="w-4 h-4" /> : <FiPlay className="w-4 h-4 ml-0.5" />}
          </button>

          {/* Quick Skip -10s */}
          <button
            type="button"
            onClick={() => handleSkip(-10)}
            disabled={!isHostOrMod}
            title="Rewind 10 seconds"
            aria-label="Rewind 10 seconds"
            className="w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center active:scale-95 cursor-pointer"
          >
            <FiRotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Quick Skip +10s */}
          <button
            type="button"
            onClick={() => handleSkip(10)}
            disabled={!isHostOrMod}
            title="Fast forward 10 seconds"
            aria-label="Fast forward 10 seconds"
            className="w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center active:scale-95 cursor-pointer"
          >
            <FiRotateCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right side: Host status OR Participant "Request control" Button */}
        <div className="flex items-center gap-3">
          {isHostOrMod ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>Direct Control</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={onRequestControl}
              className={`h-9 px-3.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shadow-md active:scale-95 focus:outline-none focus-visible:ring-2 cursor-pointer ${
                hasPendingRequest
                  ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 focus-visible:ring-amber-500'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-950/30 focus-visible:ring-blue-500'
              }`}
              title={
                hasPendingRequest
                  ? 'You have a control request pending review'
                  : 'Request control from the Host or Moderator'
              }
            >
              {hasPendingRequest ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  <span>Request Pending...</span>
                </>
              ) : (
                <>
                  <FiSend className="w-3 h-3" />
                  <span>Request Control</span>
                </>
              )}
            </button>
          )}

          <span className="hidden sm:inline-block text-slate-700">•</span>

          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono text-slate-300 uppercase tracking-wider bg-slate-950/70 border border-slate-800">
            <FiRadio className={`w-3 h-3 ${playbackState === 'playing' ? 'text-emerald-400 animate-pulse' : 'text-slate-400'}`} />
            <span>{playbackState}</span>
          </span>
        </div>
      </div>
    </div>
  );
};
