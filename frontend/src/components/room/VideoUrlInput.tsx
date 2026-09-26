import React, { useState } from 'react';
import { FiYoutube, FiCheck, FiAlertCircle, FiSend } from 'react-icons/fi';
import { extractYouTubeVideoId } from '../../utils/youtube';

interface VideoUrlInputProps {
  currentVideoId: string;
  isHostOrMod: boolean;
  onChangeVideo: (videoId: string) => void;
  onRequestChangeVideo?: (videoId: string) => void;
}

export const VideoUrlInput: React.FC<VideoUrlInputProps> = ({
  currentVideoId,
  isHostOrMod,
  onChangeVideo,
  onRequestChangeVideo,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const trimmed = inputValue.trim();
    if (!trimmed) {
      setError('Please enter a YouTube video URL or ID.');
      return;
    }

    const videoId = extractYouTubeVideoId(trimmed);
    if (!videoId) {
      setError('Invalid YouTube URL or ID. Must be a valid 11-character YouTube video.');
      return;
    }

    if (videoId === currentVideoId) {
      setError('This video is already loaded.');
      return;
    }

    setError(null);

    if (isHostOrMod) {
      onChangeVideo(videoId);
      setSuccessNotice('Video changed for all participants.');
    } else {
      onRequestChangeVideo?.(videoId);
      setSuccessNotice('Video change request submitted to Host and Moderators.');
    }

    setInputValue('');
    setTimeout(() => setSuccessNotice(null), 3500);
  };

  return (
    <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3 sm:p-4 shadow-sm flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label htmlFor="video-url-input" className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
          <FiYoutube className="w-4 h-4 text-red-500" />
          <span>{isHostOrMod ? 'Change Video' : 'Request Video Change'}</span>
        </label>
        <span className="text-[11px] font-mono text-slate-400">
          Current ID: <span className="text-slate-200">{currentVideoId}</span>
        </span>
      </div>

      {error && (
        <div role="alert" className="p-2 rounded-lg bg-red-950/60 border border-red-800/80 text-red-300 text-xs flex items-center gap-2">
          <FiAlertCircle className="w-3.5 h-3.5 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {successNotice && (
        <div role="status" className="p-2 rounded-lg bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 text-xs flex items-center gap-2">
          <FiCheck className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
          <span>{successNotice}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
        <input
          id="video-url-input"
          type="text"
          placeholder={
            isHostOrMod
              ? 'Paste YouTube link or ID (e.g. dQw4w9WgXcQ)'
              : 'Paste YouTube link to request video change'
          }
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            if (error) setError(null);
          }}
          className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
        />

        <button
          type="submit"
          disabled={!inputValue.trim()}
          className={`px-4 py-2 rounded-lg text-white text-xs sm:text-sm font-medium transition-colors whitespace-nowrap focus:outline-none focus:ring-2 flex items-center justify-center gap-1.5 ${
            isHostOrMod
              ? 'bg-red-600 hover:bg-red-500 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed focus:ring-red-500/50'
              : 'bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed focus:ring-blue-500/50'
          }`}
        >
          {isHostOrMod ? (
            <span>Change Video</span>
          ) : (
            <>
              <FiSend className="w-3 h-3" />
              <span>Request Change</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};
