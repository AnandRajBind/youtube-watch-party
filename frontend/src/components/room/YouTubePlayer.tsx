import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from 'react';
import { FiLoader, FiAlertCircle } from 'react-icons/fi';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export type PlayerPlaybackState = 'playing' | 'paused' | 'buffering' | 'unstarted' | 'ended';

export interface YouTubePlayerHandle {
  applyRemotePlay: (currentTime: number) => void;
  applyRemotePause: (currentTime: number) => void;
  applyRemoteSeek: (currentTime: number) => void;
  applyRemoteChangeVideo: (
    videoId: string,
    startSeconds?: number,
    state?: 'playing' | 'paused'
  ) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
}

interface YouTubePlayerProps {
  videoId: string;
  isHostOrMod: boolean;
  onLocalPlay?: (currentTime: number) => void;
  onLocalPause?: (currentTime: number) => void;
  onLocalSeek?: (currentTime: number) => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onStateChange?: (state: PlayerPlaybackState) => void;
  onReady?: () => void;
}

/**
 * Safely loads the YouTube IFrame API script once across the entire application lifecycle.
 */
function loadYouTubeIframeApi(callback: () => void): void {
  if (typeof window === 'undefined') return;

  if (window.YT && window.YT.Player) {
    callback();
    return;
  }

  const prevOnReady = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = () => {
    if (typeof prevOnReady === 'function') {
      prevOnReady();
    }
    callback();
  };

  const existingScript = document.querySelector(
    'script[src="https://www.youtube.com/iframe_api"]'
  );

  if (!existingScript) {
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    document.head.appendChild(script);
  }
}

export const YouTubePlayer = forwardRef<YouTubePlayerHandle, YouTubePlayerProps>(
  (
    {
      videoId,
      isHostOrMod,
      onLocalPlay,
      onLocalPause,
      onTimeUpdate,
      onStateChange,
      onReady,
    },
    ref
  ) => {
    const containerId = useRef(
      `yt-player-${Math.random().toString(36).substring(2, 9)}`
    ).current;

    const playerRef = useRef<any>(null);
    const [isPlayerReady, setIsPlayerReady] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    // CRITICAL: Remote update vs Local user action distinction flag
    // Prevents infinite Socket.IO synchronization loops
    const isRemoteUpdateRef = useRef(false);
    const remoteUpdateTimerRef = useRef<number | null>(null);

    const timeUpdateIntervalRef = useRef<number | null>(null);
    const isHostOrModRef = useRef(isHostOrMod);
    isHostOrModRef.current = isHostOrMod;

    const currentVideoIdRef = useRef(videoId);
    currentVideoIdRef.current = videoId;

    // Helper: Mark next player state change as remote-initiated
    const markRemoteAction = (durationMs = 800) => {
      isRemoteUpdateRef.current = true;
      if (remoteUpdateTimerRef.current) {
        window.clearTimeout(remoteUpdateTimerRef.current);
      }
      remoteUpdateTimerRef.current = window.setTimeout(() => {
        isRemoteUpdateRef.current = false;
      }, durationMs);
    };

    // Helper: Map YT.PlayerState numeric enum to readable string
    const mapPlayerState = (ytState: number): PlayerPlaybackState => {
      if (!window.YT) return 'unstarted';
      switch (ytState) {
        case window.YT.PlayerState.PLAYING:
          return 'playing';
        case window.YT.PlayerState.PAUSED:
          return 'paused';
        case window.YT.PlayerState.BUFFERING:
          return 'buffering';
        case window.YT.PlayerState.ENDED:
          return 'ended';
        default:
          return 'unstarted';
      }
    };

    // Start periodic playhead polling
    const startProgressTracker = useCallback(() => {
      if (timeUpdateIntervalRef.current) {
        window.clearInterval(timeUpdateIntervalRef.current);
      }

      timeUpdateIntervalRef.current = window.setInterval(() => {
        if (
          playerRef.current &&
          typeof playerRef.current.getCurrentTime === 'function' &&
          typeof playerRef.current.getDuration === 'function'
        ) {
          const time = playerRef.current.getCurrentTime() || 0;
          const dur = playerRef.current.getDuration() || 0;
          onTimeUpdate?.(time, dur);
        }
      }, 300);
    }, [onTimeUpdate]);

    // Initialize YouTube Player
    const initPlayer = useCallback(() => {
      if (!window.YT || !window.YT.Player || playerRef.current) return;

      try {
        playerRef.current = new window.YT.Player(containerId, {
          videoId,
          playerVars: {
            autoplay: 0,
            controls: isHostOrModRef.current ? 1 : 0,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            origin: window.location.origin,
            enablejsapi: 1,
            fs: 1,
          },
          events: {
            onReady: () => {
              setIsPlayerReady(true);
              setLoadError(null);
              onReady?.();
              startProgressTracker();
            },
            onStateChange: (event: { data: number }) => {
              const state = mapPlayerState(event.data);
              onStateChange?.(state);

              // -------------------------------------------------------------
              // LOOP PREVENTION: Check if state change was caused by a remote
              // server update. If yes, ignore to avoid echoing back to server!
              // -------------------------------------------------------------
              if (isRemoteUpdateRef.current) {
                return;
              }

              // Only authorized Host or Moderator can trigger local playback actions
              if (!isHostOrModRef.current) {
                return;
              }

              const currentTime = playerRef.current?.getCurrentTime?.() || 0;

              // Local User Action: Play
              if (event.data === window.YT.PlayerState.PLAYING) {
                onLocalPlay?.(currentTime);
              }
              // Local User Action: Pause
              else if (event.data === window.YT.PlayerState.PAUSED) {
                onLocalPause?.(currentTime);
              }
            },
            onError: (event: { data: number }) => {
              setLoadError(
                `YouTube Player Error (${event.data}). The video may be private, age-restricted, or embedding is disabled.`
              );
            },
          },
        });
      } catch {
        setLoadError('Failed to initialize YouTube IFrame player.');
      }
    }, [containerId, onReady, onStateChange, onLocalPlay, onLocalPause, startProgressTracker, videoId]);

    // Mount lifecycle: Load API and instantiate
    useEffect(() => {
      loadYouTubeIframeApi(() => {
        initPlayer();
      });

      return () => {
        if (timeUpdateIntervalRef.current) {
          window.clearInterval(timeUpdateIntervalRef.current);
        }
        if (remoteUpdateTimerRef.current) {
          window.clearTimeout(remoteUpdateTimerRef.current);
        }
        if (playerRef.current && typeof playerRef.current.destroy === 'function') {
          try {
            playerRef.current.destroy();
          } catch {
            // ignore cleanup errors
          }
          playerRef.current = null;
        }
      };
    }, [initPlayer]);

    // -------------------------------------------------------------------------
    // EXPOSE IMPERATIVE METHODS FOR REMOTE SERVER UPDATES
    // -------------------------------------------------------------------------
    useImperativeHandle(
      ref,
      () => ({
        /**
         * Applies an authoritative remote PLAY event from the server.
         * Corrects drift and starts video without triggering an outgoing socket event.
         */
        applyRemotePlay: (targetTime: number) => {
          if (!playerRef.current) return;
          markRemoteAction();

          try {
            const localTime = playerRef.current.getCurrentTime?.() || 0;
            const drift = Math.abs(localTime - targetTime);

            if (drift > 1.2) {
              playerRef.current.seekTo(targetTime, true);
            }

            const state = playerRef.current.getPlayerState?.();
            if (state !== window.YT?.PlayerState?.PLAYING) {
              playerRef.current.playVideo();
            }
          } catch {
            // player might be uninitialized
          }
        },

        /**
         * Applies an authoritative remote PAUSE event from the server.
         * Pauses video at target time without triggering an outgoing socket event.
         */
        applyRemotePause: (targetTime: number) => {
          if (!playerRef.current) return;
          markRemoteAction();

          try {
            const localTime = playerRef.current.getCurrentTime?.() || 0;
            const drift = Math.abs(localTime - targetTime);

            if (drift > 1.2) {
              playerRef.current.seekTo(targetTime, true);
            }

            const state = playerRef.current.getPlayerState?.();
            if (state !== window.YT?.PlayerState?.PAUSED) {
              playerRef.current.pauseVideo();
            }
          } catch {
            // player might be uninitialized
          }
        },

        /**
         * Applies an authoritative remote SEEK event from the server.
         */
        applyRemoteSeek: (targetTime: number) => {
          if (!playerRef.current) return;
          markRemoteAction();

          try {
            playerRef.current.seekTo(targetTime, true);
          } catch {
            // player might be uninitialized
          }
        },

        /**
         * Applies an authoritative remote CHANGE_VIDEO event from the server.
         */
        applyRemoteChangeVideo: (
          newVideoId: string,
          startSeconds: number = 0,
          state: 'playing' | 'paused' = 'paused'
        ) => {
          if (!playerRef.current) return;
          markRemoteAction(1500);

          try {
            if (state === 'playing') {
              playerRef.current.loadVideoById({
                videoId: newVideoId,
                startSeconds,
              });
            } else {
              playerRef.current.cueVideoById({
                videoId: newVideoId,
                startSeconds,
              });
            }
          } catch {
            // player might be uninitialized
          }
        },

        getCurrentTime: () => {
          try {
            return playerRef.current?.getCurrentTime?.() || 0;
          } catch {
            return 0;
          }
        },

        getDuration: () => {
          try {
            return playerRef.current?.getDuration?.() || 0;
          } catch {
            return 0;
          }
        },
      }),
      []
    );

    return (
      <div className="w-full aspect-video bg-black rounded-xl overflow-hidden relative shadow-lg border border-slate-800 select-none">
        {/* Target div for YouTube IFrame insertion */}
        <div id={containerId} className="w-full h-full" />

        {/* Participant (Viewer Mode) Non-Interactive Click Shield */}
        {/* Prevents participants from clicking the iframe and causing desync */}
        {!isHostOrMod && isPlayerReady && !loadError && (
          <div
            className="absolute inset-0 z-10 bg-transparent cursor-default"
            title="Viewer Mode: Playback is synchronized to the Host"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          />
        )}

        {/* Loading Overlay */}
        {!isPlayerReady && !loadError && (
          <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center gap-3 z-20">
            <FiLoader className="w-8 h-8 text-red-500 animate-spin" />
            <span className="text-xs text-slate-400 font-medium">Loading YouTube player...</span>
          </div>
        )}

        {/* Error Overlay */}
        {loadError && (
          <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center p-6 text-center z-30">
            <FiAlertCircle className="w-8 h-8 text-rose-400 mb-2" />
            <p className="text-sm font-medium text-white mb-1">Playback Error</p>
            <p className="text-xs text-slate-400 max-w-md">{loadError}</p>
          </div>
        )}
      </div>
    );
  }
);

YouTubePlayer.displayName = 'YouTubePlayer';
