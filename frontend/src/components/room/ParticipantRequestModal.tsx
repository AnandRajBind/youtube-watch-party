import React, { useState, useEffect } from 'react';
import {
  FiX,
  FiPlay,
  FiPause,
  FiFastForward,
  FiYoutube,
  FiSend,
  FiAlertCircle,
} from 'react-icons/fi';
import type { ActionRequestType } from '../../types/socket.types';
import { extractYouTubeVideoId, formatPlaybackTime } from '../../utils/youtube';

interface ParticipantRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTime: number;
  duration: number;
  currentVideoId: string;
  onSubmitRequest: (
    action: ActionRequestType,
    options?: { time?: number; videoId?: string }
  ) => void;
}

export const ParticipantRequestModal: React.FC<ParticipantRequestModalProps> = ({
  isOpen,
  onClose,
  currentTime,
  duration,
  onSubmitRequest,
}) => {
  const [selectedAction, setSelectedAction] = useState<ActionRequestType>('play');
  const [seekSeconds, setSeekSeconds] = useState<number>(Math.floor(currentTime));
  const [videoInput, setVideoInput] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (selectedAction === 'play') {
      onSubmitRequest('play', { time: currentTime });
    } else if (selectedAction === 'pause') {
      onSubmitRequest('pause', { time: currentTime });
    } else if (selectedAction === 'seek') {
      if (isNaN(seekSeconds) || seekSeconds < 0) {
        setFormError('Please enter a valid seek time in seconds.');
        return;
      }
      onSubmitRequest('seek', { time: seekSeconds });
    } else if (selectedAction === 'change_video') {
      const extractedId = extractYouTubeVideoId(videoInput.trim());
      if (!extractedId) {
        setFormError('Please enter a valid YouTube video URL or 11-character video ID.');
        return;
      }
      onSubmitRequest('change_video', { videoId: extractedId });
    }

    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="request-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl p-6 sm:p-7 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between pb-3.5 border-b border-slate-800">
          <div>
            <h2 id="request-modal-title" className="text-base sm:text-lg font-bold text-white tracking-tight">
              Request Playback Action
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Submit a proposal for the room Host or Moderator to review.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <FiX className="w-4 h-4" />
          </button>
        </div>

        {formError && (
          <div role="alert" className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-200 text-xs flex items-center gap-2.5">
            <FiAlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{formError}</span>
          </div>
        )}

        {/* Action Type Selector */}
        <div className="grid grid-cols-2 gap-2.5 text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setSelectedAction('play');
              setFormError(null);
            }}
            className={`h-11 rounded-xl border flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer ${
              selectedAction === 'play'
                ? 'bg-red-500/15 border-red-500/80 text-red-300 shadow-xs shadow-red-950/20'
                : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-800 hover:border-slate-700'
            }`}
          >
            <FiPlay className="w-3.5 h-3.5" />
            <span>Request Play</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedAction('pause');
              setFormError(null);
            }}
            className={`h-11 rounded-xl border flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer ${
              selectedAction === 'pause'
                ? 'bg-red-500/15 border-red-500/80 text-red-300 shadow-xs shadow-red-950/20'
                : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-800 hover:border-slate-700'
            }`}
          >
            <FiPause className="w-3.5 h-3.5" />
            <span>Request Pause</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedAction('seek');
              setFormError(null);
            }}
            className={`h-11 rounded-xl border flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer ${
              selectedAction === 'seek'
                ? 'bg-blue-500/15 border-blue-500/80 text-blue-300 shadow-xs shadow-blue-950/20'
                : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-800 hover:border-slate-700'
            }`}
          >
            <FiFastForward className="w-3.5 h-3.5" />
            <span>Request Seek</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedAction('change_video');
              setFormError(null);
            }}
            className={`h-11 rounded-xl border flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer ${
              selectedAction === 'change_video'
                ? 'bg-blue-500/15 border-blue-500/80 text-blue-300 shadow-xs shadow-blue-950/20'
                : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-800 hover:border-slate-700'
            }`}
          >
            <FiYoutube className="w-3.5 h-3.5" />
            <span>Request Video</span>
          </button>
        </div>

        {/* Dynamic Fields for Seek or Change Video */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-1">
          {selectedAction === 'seek' && (
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5">
              <label htmlFor="seek-time-input" className="block text-xs font-semibold text-slate-300 mb-2">
                Target Timestamp: <span className="font-mono text-white text-sm ml-1">{formatPlaybackTime(seekSeconds)}</span>
              </label>
              <input
                id="seek-time-input"
                type="range"
                min={0}
                max={duration || 600}
                value={seekSeconds}
                onChange={(e) => setSeekSeconds(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg accent-blue-500 cursor-pointer"
              />
              <div className="flex justify-between text-[11px] font-mono text-slate-400 mt-1.5">
                <span>00:00</span>
                <span>{formatPlaybackTime(duration)}</span>
              </div>
            </div>
          )}

          {selectedAction === 'change_video' && (
            <div>
              <label htmlFor="change-video-input" className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                YouTube URL or Video ID
              </label>
              <input
                id="change-video-input"
                type="text"
                placeholder="https://www.youtube.com/watch?v=..."
                value={videoInput}
                onChange={(e) => setVideoInput(e.target.value)}
                className="w-full h-11 px-4 rounded-xl bg-slate-950/70 border border-slate-800 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              />
            </div>
          )}

          {(selectedAction === 'play' || selectedAction === 'pause') && (
            <p className="text-xs text-slate-300 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 leading-relaxed">
              Requesting to <span className="text-white font-semibold capitalize">{selectedAction}</span> playback at current timestamp{' '}
              <span className="font-mono text-white font-semibold">({formatPlaybackTime(currentTime)})</span>.
            </p>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-4 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="h-10 px-5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold transition-all flex items-center gap-2 shadow-md shadow-blue-950/30 active:scale-95 cursor-pointer"
            >
              <FiSend className="w-3.5 h-3.5" />
              <span>Send Request</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
