/**
 * Room Code & Username Parsing and Validation Utilities
 */

/**
 * Extracts and formats a room code from raw user input.
 * Supports:
 * - Direct codes: "ABC-XYZ", "abcxyz", "ABCXYZ"
 * - Full URLs: "http://localhost:5173/room/ABC-XYZ", "https://watchparty.com/room/abcxyz"
 * - Paths: "/room/ABC-XYZ"
 */
export function parseRoomCode(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();

  // Match /room/:roomCode pattern from URLs or paths
  const urlMatch = trimmed.match(/(?:room\/|^)([A-Za-z0-9]{3}-?[A-Za-z0-9]{3})(?:\/|\?|#|$)/i);
  if (urlMatch && urlMatch[1]) {
    const raw = urlMatch[1].toUpperCase();
    if (raw.length === 6 && !raw.includes('-')) {
      return `${raw.slice(0, 3)}-${raw.slice(3)}`;
    }
    return raw;
  }

  // Strip non-alphanumeric and dashes
  const clean = trimmed.toUpperCase().replace(/[^A-Z0-9-]/g, '');
  if (clean.length === 6 && !clean.includes('-')) {
    return `${clean.slice(0, 3)}-${clean.slice(3)}`;
  }
  return clean;
}

/**
 * Checks if a string conforms to the backend room code regex:
 * /^[A-Z0-9]{3}-[A-Z0-9]{3}$|^[A-Z0-9]{6}$/
 */
export function isValidRoomCode(code: string): boolean {
  if (!code) return false;
  const parsed = parseRoomCode(code);
  return /^[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(parsed);
}

/**
 * Validates a username according to backend validation rules:
 * - Length: 2 to 50 characters
 * - Characters: letters, numbers, spaces, underscores, hyphens
 */
export function validateUsername(username: string): { isValid: boolean; error?: string } {
  const trimmed = username?.trim();
  if (!trimmed) {
    return { isValid: false, error: 'Username is required' };
  }
  if (trimmed.length < 2) {
    return { isValid: false, error: 'Username must be at least 2 characters long' };
  }
  if (trimmed.length > 50) {
    return { isValid: false, error: 'Username cannot exceed 50 characters' };
  }
  if (!/^[a-zA-Z0-9_\s-]+$/.test(trimmed)) {
    return {
      isValid: false,
      error: 'Username may only contain letters, numbers, spaces, underscores, and hyphens',
    };
  }
  return { isValid: true };
}
