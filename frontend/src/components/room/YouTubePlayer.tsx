import React, { useEffect, useRef, useState, useCallback } from 'react';
import { FiLoader, FiAlertCircle } from 'react-icons/fi';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: (() => void) | undefined;
  }
}

interface YouTubePlayerProps {
  videoId: string;
  playbackState: 'playing' | 'paused';
  playbackTime: number;
  isHostOrMod: boolean;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onPlayerReady?: () => void;
}

export const YouTubePlayer: React.FC<YouTubePlayerProps> = ({
  videoId,
  playbackState,
  playbackTime,
  isHostOrMod,
  onTimeUpdate,
  onPlayerReady,
}) => {
  const containerId = useRef(`yt-player-${Math.random().toString(36).substring(2, 9)}`).current;
  const playerRef = useRef<any>(null);
  const [isReady, setIsReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Flags to prevent echo loops
  const isInternalSyncRef = useRef(false);
  const currentVideoIdRef = useRef(videoId);
  const timeUpdateIntervalRef = useRef<number | null>(null);

  // 1. Load YouTube IFrame API script once
  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;

      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);

      const previousOnReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (previousOnReady) previousOnReady();
        initPlayer();
      };
    } else if (window.YT && window.YT.Player) {
      initPlayer();
    }

    return () => {
      if (timeUpdateIntervalRef.current) {
        window.clearInterval(timeUpdateIntervalRef.current);
      }
      if (playerRef.current && typeof playerRef.current.destroy === 'function') {
        try {
          playerRef.current.destroy();
        } catch {
          // ignore cleanup errors
        }
      }
    };
  }, []);

  // 2. Initialize Player
  const initPlayer = useCallback(() => {
    if (!window.YT || !window.YT.Player || playerRef.current) return;

    try {
      playerRef.current = new window.YT.Player(containerId, {
        videoId,
        playerVars: {
          autoplay: 0,
          controls: isHostOrMod ? 1 : 0, // Viewer mode hides native controls to prevent desync
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          origin: window.location.origin,
          enablejsapi: 1,
        },
        events: {
          onReady: () => {
            setIsReady(true);
            setLoadError(null);
            onPlayerReady?.();

            // Initial seek to sync state
            if (playbackTime > 0) {
              playerRef.current.seekTo(playbackTime, true);
            }
            if (playbackState === 'playing') {
              playerRef.current.playVideo();
            } else {
              playerRef.current.pauseVideo();
            }

            startTimeTracker();
          },
          onError: (e: any) => {
            setLoadError(`YouTube Error (Code ${e.data}). Video may be restricted or unavailable.`);
          },
        },
      });
    } catch (err) {
      setLoadError('Failed to initialize YouTube player.');
    }
  }, [containerId, isHostOrMod, onPlayerReady, playbackState, playbackTime, videoId]);

  // 3. Periodic playhead time tracker for progress bar
  const startTimeTracker = () => {
    if (timeUpdateIntervalRef.current) {
      window.clearInterval(timeUpdateIntervalRef.current);
    }
    timeUpdateIntervalRef.current = window.setInterval(() => {
      if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
        const currentTime = playerRef.current.getCurrentTime() || 0;
        const duration = playerRef.current.getDuration() || 0;
        onTimeUpdate?.(currentTime, duration);
      }
    }, 500);
  };

  // 4. React to videoId change from server
  useEffect(() => {
    if (!isReady || !playerRef.current) return;

    if (currentVideoIdRef.current !== videoId) {
      currentVideoIdRef.current = videoId;
      isInternalSyncRef.current = true;
      try {
        playerRef.current.loadVideoById({
          videoId,
          startSeconds: 0,
        });
        if (playbackState === 'paused') {
          playerRef.current.pauseVideo();
        }
      } catch {
        // ignore load errors
      }
      setTimeout(() => {
        isInternalSyncRef.current = false;
      }, 500);
    }
  }, [videoId, isReady, playbackState]);

  // 5. React to playback state changes from server
  useEffect(() => {
    if (!isReady || !playerRef.current) return;

    try {
      const playerState = playerRef.current.getPlayerState?.();
      const localTime = playerRef.current.getCurrentTime?.() || 0;

      // Handle seeking if drift exceeds 1.5s
      const drift = Math.abs(localTime - playbackTime);
      if (drift > 1.5) {
        playerRef.current.seekTo(playbackTime, true);
      }

      if (playbackState === 'playing') {
        if (playerState !== window.YT?.PlayerState?.PLAYING) {
          playerRef.current.playVideo();
        }
      } else {
        if (playerState !== window.YT?.PlayerState?.PAUSED) {
          playerRef.current.pauseVideo();
        }
      }
    } catch {
      // player may be uninitialized or transitioning
    }
  }, [playbackState, playbackTime, isReady]);

  return (
    <div className="w-full aspect-video bg-black rounded-xl overflow-hidden relative shadow-lg border border-slate-800">
      {/* Target div for YouTube IFrame insertion */}
      <div id={containerId} className="w-full h-full" />

      {/* Loading Overlay */}
      {!isReady && !loadError && (
        <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center gap-3 z-10">
          <FiLoader className="w-8 h-8 text-red-500 animate-spin" />
          <span className="text-xs text-slate-400 font-medium">Loading YouTube player...</span>
        </div>
      )}

      {/* Error Overlay */}
      {loadError && (
        <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center p-6 text-center z-20">
          <FiAlertCircle className="w-8 h-8 text-rose-400 mb-2" />
          <p className="text-sm font-medium text-white mb-1">Playback Error</p>
          <p className="text-xs text-slate-400 max-w-md">{loadError}</p>
        </div>
      )}
    </div>
  );
};
