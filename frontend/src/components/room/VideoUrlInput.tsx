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
    <div className="bg-slate-900/70 backdrop-blur-md border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl shadow-black/20 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <label htmlFor="video-url-input" className="text-xs font-semibold text-slate-300 flex items-center gap-2 uppercase tracking-wider">
          <FiYoutube className="w-4 h-4 text-red-500" />
          <span>{isHostOrMod ? 'Change YouTube Video' : 'Request Video Change'}</span>
        </label>
        <span className="text-xs font-mono text-slate-400 bg-slate-950/70 border border-slate-800 px-2.5 py-0.5 rounded-lg">
          ID: <span className="text-white font-medium">{currentVideoId}</span>
        </span>
      </div>

      {error && (
        <div role="alert" className="p-3 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-200 text-xs flex items-center gap-2.5 shadow-xs">
          <FiAlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {successNotice && (
        <div role="status" className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-800/80 text-emerald-200 text-xs flex items-center gap-2.5 shadow-xs">
          <FiCheck className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{successNotice}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2.5">
        <input
          id="video-url-input"
          type="text"
          placeholder={
            isHostOrMod
              ? 'Paste YouTube link or video ID (e.g. wYnY3l5BEgs)'
              : 'Paste YouTube link to request video change'
          }
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            if (error) setError(null);
          }}
          className="flex-1 h-11 px-4 rounded-xl bg-slate-950/70 border border-slate-800 text-sm text-white placeholder-slate-500 transition-all focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
        />

        <button
          type="submit"
          disabled={!inputValue.trim()}
          className={`h-11 px-5 rounded-xl text-white text-sm font-semibold transition-all whitespace-nowrap focus:outline-none focus-visible:ring-2 flex items-center justify-center gap-2 active:scale-95 cursor-pointer shadow-md ${
            isHostOrMod
              ? 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 shadow-red-950/30 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed focus-visible:ring-red-500'
              : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-blue-950/30 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed focus-visible:ring-blue-500'
          }`}
        >
          {isHostOrMod ? (
            <span>Change Video</span>
          ) : (
            <>
              <FiSend className="w-3.5 h-3.5" />
              <span>Request Change</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};
