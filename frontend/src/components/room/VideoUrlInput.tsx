import React, { useState } from 'react';
import { FiYoutube, FiCheck, FiAlertCircle } from 'react-icons/fi';
import { extractYouTubeVideoId } from '../../utils/youtube';

interface VideoUrlInputProps {
  currentVideoId: string;
  isHostOrMod: boolean;
  onChangeVideo: (videoId: string) => void;
}

export const VideoUrlInput: React.FC<VideoUrlInputProps> = ({
  currentVideoId,
  isHostOrMod,
  onChangeVideo,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isHostOrMod) return;

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
    onChangeVideo(videoId);
    setInputValue('');
    setSuccessNotice(true);
    setTimeout(() => setSuccessNotice(false), 3000);
  };

  return (
    <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3 sm:p-4 shadow-sm flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label htmlFor="video-url-input" className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
          <FiYoutube className="w-4 h-4 text-red-500" />
          <span>Change Video</span>
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
          <span>Video change broadcasted to all participants.</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
        <input
          id="video-url-input"
          type="text"
          placeholder={isHostOrMod ? "Paste YouTube video link or ID (e.g. dQw4w9WgXcQ)" : "Only Host or Moderator can change video"}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            if (error) setError(null);
          }}
          disabled={!isHostOrMod}
          className={`flex-1 px-3 py-2 rounded-lg bg-slate-900 border text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/30 ${
            !isHostOrMod ? 'opacity-60 cursor-not-allowed border-slate-800' : 'border-slate-700 focus:border-red-500'
          }`}
        />

        <button
          type="submit"
          disabled={!isHostOrMod || !inputValue.trim()}
          className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-medium transition-colors whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-red-500/50"
        >
          Change Video
        </button>
      </form>
    </div>
  );
};
