/**
 * Safe, cross-browser clipboard utility with graceful fallback.
 * Works across modern browsers (Clipboard API), older browsers (execCommand),
 * and restricted/insecure execution environments.
 */

/**
 * Copies the specified text to the user's clipboard.
 * 
 * 1. Attempts modern `navigator.clipboard.writeText` when available in a secure context.
 * 2. Falls back to `document.execCommand('copy')` with an off-screen, read-only textarea.
 * 3. Returns `true` if copy succeeded, `false` if clipboard access is completely unavailable.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  // 1. Try modern asynchronous Clipboard API if supported and available
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied, non-secure context, or iframe restriction: proceed to fallback
    }
  }

  // 2. Fallback: document.execCommand('copy') with offscreen textarea
  if (typeof document !== 'undefined') {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      // Fixed position to prevent mobile viewport jump/scrolling
      textArea.style.position = 'fixed';
      textArea.style.top = '0';
      textArea.style.left = '-9999px';
      textArea.style.opacity = '0';
      textArea.setAttribute('readonly', '');
      textArea.setAttribute('aria-hidden', 'true');
      
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      textArea.setSelectionRange(0, text.length);

      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);

      if (successful) {
        return true;
      }
    } catch {
      // Fallback failed or blocked by browser security policy
    }
  }

  return false;
}

/**
 * Generates the public watch party room URL using the current browser origin.
 * Does not expose any internal backend server URLs, ports, or secrets.
 *
 * Example: "https://my-app.com/room/ABC-XYZ" or "http://localhost:5173/room/ABC-XYZ"
 */
export function getRoomShareUrl(roomCode: string): string {
  const cleanCode = (roomCode || '').trim();
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return `${window.location.origin}/room/${encodeURIComponent(cleanCode)}`;
  }
  return `/room/${encodeURIComponent(cleanCode)}`;
}
