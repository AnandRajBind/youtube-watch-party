import { z } from 'zod';

// Username sanitization and validation rule
// Disallows HTML brackets < >, control characters, and enforces length
const usernameValidation = z
  .string({
    required_error: 'Username is required',
    invalid_type_error: 'Username must be a string',
  })
  .trim()
  .min(2, 'Username must be at least 2 characters long')
  .max(50, 'Username cannot exceed 50 characters')
  .regex(
    /^[a-zA-Z0-9_\s-]+$/,
    'Username may only contain letters, numbers, spaces, underscores, and hyphens'
  )
  .transform((val) => val.replace(/<[^>]*>?/gm, '')); // Extra XSS strip safety

// Room code regex validation (supports "ABC-XYZ" or "ABCDEF")
const roomCodeValidation = z
  .string({
    required_error: 'Room code is required',
    invalid_type_error: 'Room code must be a string',
  })
  .trim()
  .toUpperCase()
  .regex(
    /^[A-Z0-9]{3}-[A-Z0-9]{3}$|^[A-Z0-9]{6}$/,
    'Room code must be in XXX-XXX or XXXXXX format'
  );

// Optional YouTube URL or ID validation
const videoUrlValidation = z
  .string({
    invalid_type_error: 'Video URL must be a string',
  })
  .trim()
  .max(500, 'Video URL is too long')
  .optional();

const userIdValidation = z
  .string({
    invalid_type_error: 'User ID must be a string',
  })
  .trim()
  .max(100, 'User ID is too long')
  .optional();

/**
 * Validation schema for POST /api/rooms
 */
export const createRoomSchema = z.object({
  body: z.object({
    username: usernameValidation,
    initialVideoUrl: videoUrlValidation,
    userId: userIdValidation,
  }),
});

/**
 * Validation schema for GET /api/rooms/:roomCode
 */
export const getRoomSchema = z.object({
  params: z.object({
    roomCode: roomCodeValidation,
  }),
});

/**
 * Validation schema for POST /api/rooms/:roomCode/join
 */
export const joinRoomSchema = z.object({
  params: z.object({
    roomCode: roomCodeValidation,
  }),
  body: z.object({
    username: usernameValidation,
    userId: userIdValidation,
  }),
});

export type CreateRoomInput = z.infer<typeof createRoomSchema>['body'];
export type JoinRoomInput = z.infer<typeof joinRoomSchema>['body'];
