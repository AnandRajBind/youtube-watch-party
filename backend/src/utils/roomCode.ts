import crypto from 'crypto';

/**
 * Generates a clean, readable 6-character room code (e.g., 'K7X-9QM')
 * using crypto-secure random bytes.
 */
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excludes ambiguous chars (0, O, 1, I)
  const bytes = crypto.randomBytes(6);
  let code = '';

  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i] % chars.length];
  }

  return `${code.slice(0, 3)}-${code.slice(3, 6)}`;
}
