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
    <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3 sm:p-4 shadow-sm flex flex-col gap-3">
      {/* Progress Bar (Scrubber) */}
      <div className="flex flex-col gap-1 w-full">
        <div className="relative w-full flex items-center">
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.5}
            value={currentTime}
            onChange={handleSliderChange}
            disabled={!isHostOrMod}
            aria-label="Video scrubber"
            className={`w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-red-500 accent-red-600 ${
              !isHostOrMod ? 'cursor-default pointer-events-none opacity-80' : ''
            }`}
            style={{
              background: `linear-gradient(to right, #dc2626 0%, #dc2626 ${progressPercentage}%, #334155 ${progressPercentage}%, #334155 100%)`,
            }}
          />
        </div>

        {/* Timestamps */}
        <div className="flex items-center justify-between text-[11px] sm:text-xs font-mono text-slate-400">
          <span>{formatPlaybackTime(currentTime)}</span>
          <span>{formatPlaybackTime(duration)}</span>
        </div>
      </div>

      {/* Control Buttons & Role Indicator */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-700/60">
        <div className="flex items-center gap-2">
          {/* Play / Pause Toggle */}
          <button
            type="button"
            onClick={handleTogglePlay}
            disabled={!isHostOrMod}
            title={isHostOrMod ? (playbackState === 'playing' ? 'Pause' : 'Play') : 'Viewer mode: synchronized to host'}
            aria-label={playbackState === 'playing' ? 'Pause video' : 'Play video'}
            className={`p-2.5 rounded-lg flex items-center justify-center text-white transition-colors ${
              isHostOrMod
                ? 'bg-red-600 hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/50'
                : 'bg-slate-700 text-slate-400 cursor-not-allowed opacity-60'
            }`}
          >
            {playbackState === 'playing' ? <FiPause className="w-4 h-4" /> : <FiPlay className="w-4 h-4" />}
          </button>

          {/* Quick Skip -10s */}
          <button
            type="button"
            onClick={() => handleSkip(-10)}
            disabled={!isHostOrMod}
            title="-10 seconds"
            aria-label="Rewind 10 seconds"
            className="p-2 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <FiRotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Quick Skip +10s */}
          <button
            type="button"
            onClick={() => handleSkip(10)}
            disabled={!isHostOrMod}
            title="+10 seconds"
            aria-label="Fast forward 10 seconds"
            className="p-2 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <FiRotateCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right side: Host status OR Participant "Request control" Button */}
        <div className="flex items-center gap-2.5">
          {isHostOrMod ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>Direct Control</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={onRequestControl}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors flex items-center gap-1.5 shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              <FiSend className="w-3 h-3" />
              <span>Request control</span>
            </button>
          )}

          <span className="hidden sm:inline-block text-slate-600">•</span>

          <span className="text-[11px] font-mono text-slate-400 uppercase bg-slate-900 px-2 py-0.5 rounded border border-slate-700/60 flex items-center gap-1">
            <FiRadio className="w-3 h-3 text-red-400" />
            <span>{playbackState}</span>
          </span>
        </div>
      </div>
    </div>
  );
};
