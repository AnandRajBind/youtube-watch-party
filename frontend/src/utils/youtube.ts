/**
 * YouTube Utility Functions
 * Supports all standard, shortened, shorts, embed, and live YouTube URL formats.
 */

/**
 * Validates whether an input string is a valid 11-character YouTube video ID.
 */
export function isValidYouTubeVideoId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  return /^[a-zA-Z0-9_-]{11}$/.test(id.trim());
}

/**
 * Extracts an 11-character YouTube video ID from a URL or raw ID string.
 * Supports:
 * - https://www.youtube.com/watch?v=dQw4w9WgXcQ
 * - https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s
 * - https://youtu.be/dQw4w9WgXcQ
 * - https://youtu.be/dQw4w9WgXcQ?si=abcdef
 * - https://www.youtube.com/embed/dQw4w9WgXcQ
 * - https://www.youtube.com/v/dQw4w9WgXcQ
 * - https://www.youtube.com/shorts/dQw4w9WgXcQ
 * - https://www.youtube.com/live/dQw4w9WgXcQ
 * - dQw4w9WgXcQ (raw 11-character ID)
 */
export function extractYouTubeVideoId(input: string): string | null {
  if (!input || typeof input !== 'string') {
    return null;
  }

  const trimmed = input.trim();

  // 1. Direct 11-character ID
  if (isValidYouTubeVideoId(trimmed)) {
    return trimmed;
  }

  // 2. Comprehensive URL regex matching watch, shorts, live, embed, youtu.be, etc.
  const urlPattern =
    /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

  const match = trimmed.match(urlPattern);
  if (match && match[1] && isValidYouTubeVideoId(match[1])) {
    return match[1];
  }

  // 3. Fallback for URLSearchParams if standard URL
  try {
    const urlObj = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    const vParam = urlObj.searchParams.get('v');
    if (vParam && isValidYouTubeVideoId(vParam)) {
      return vParam;
    }
  } catch {
    // not a standard URL, ignore
  }

  return null;
}

/**
 * Formats time in seconds to mm:ss or hh:mm:ss.
 */
export function formatPlaybackTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds < 0) {
    return '00:00';
  }

  const totalSecs = Math.floor(seconds);
  const hours = Math.floor(totalSecs / 3600);
  const minutes = Math.floor((totalSecs % 3600) / 60);
  const remainingSecs = totalSecs % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');

  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(remainingSecs)}`;
  }
  return `${pad(minutes)}:${pad(remainingSecs)}`;
}
