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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl p-5 sm:p-6 shadow-xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <h2 id="request-modal-title" className="text-base font-semibold text-white">
              Request Playback Action
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Submit a proposal for the Host or Moderator to review.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Close dialog"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {formError && (
          <div role="alert" className="p-2.5 rounded-lg bg-red-950/60 border border-red-800 text-red-300 text-xs flex items-center gap-2">
            <FiAlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{formError}</span>
          </div>
        )}

        {/* Action Type Selector */}
        <div className="grid grid-cols-2 gap-2 text-xs font-medium">
          <button
            type="button"
            onClick={() => {
              setSelectedAction('play');
              setFormError(null);
            }}
            className={`p-2.5 rounded-lg border flex items-center justify-center gap-2 transition-colors ${
              selectedAction === 'play'
                ? 'bg-red-600/20 border-red-500 text-red-300'
                : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800'
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
            className={`p-2.5 rounded-lg border flex items-center justify-center gap-2 transition-colors ${
              selectedAction === 'pause'
                ? 'bg-red-600/20 border-red-500 text-red-300'
                : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800'
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
            className={`p-2.5 rounded-lg border flex items-center justify-center gap-2 transition-colors ${
              selectedAction === 'seek'
                ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800'
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
            className={`p-2.5 rounded-lg border flex items-center justify-center gap-2 transition-colors ${
              selectedAction === 'change_video'
                ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <FiYoutube className="w-3.5 h-3.5" />
            <span>Request Video</span>
          </button>
        </div>

        {/* Dynamic Fields for Seek or Change Video */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-1">
          {selectedAction === 'seek' && (
            <div>
              <label htmlFor="seek-time-input" className="block text-xs font-medium text-slate-300 mb-1">
                Target Timestamp: <span className="font-mono text-white">{formatPlaybackTime(seekSeconds)}</span>
              </label>
              <input
                id="seek-time-input"
                type="range"
                min={0}
                max={duration || 600}
                value={seekSeconds}
                onChange={(e) => setSeekSeconds(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-700 rounded-lg accent-blue-500 cursor-pointer"
              />
              <div className="flex justify-between text-[11px] font-mono text-slate-400 mt-1">
                <span>00:00</span>
                <span>{formatPlaybackTime(duration)}</span>
              </div>
            </div>
          )}

          {selectedAction === 'change_video' && (
            <div>
              <label htmlFor="change-video-input" className="block text-xs font-medium text-slate-300 mb-1">
                YouTube URL or Video ID
              </label>
              <input
                id="change-video-input"
                type="text"
                placeholder="https://www.youtube.com/watch?v=..."
                value={videoInput}
                onChange={(e) => setVideoInput(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          )}

          {(selectedAction === 'play' || selectedAction === 'pause') && (
            <p className="text-xs text-slate-400 bg-slate-800/40 p-2.5 rounded-lg border border-slate-800">
              Requesting to <span className="text-white font-medium capitalize">{selectedAction}</span> the video at the current position{' '}
              <span className="font-mono text-white">({formatPlaybackTime(currentTime)})</span>.
            </p>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors flex items-center gap-1.5"
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
