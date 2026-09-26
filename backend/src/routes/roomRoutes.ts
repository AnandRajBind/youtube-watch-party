import { Router } from 'express';
import { roomController } from '../controllers/roomController';
import { validateRequest } from '../middleware/validateRequest';
import {
  createRoomSchema,
  getRoomSchema,
  joinRoomSchema,
} from '../validations/roomValidation';

import { roomCreationRateLimiter } from '../middleware/rateLimiter';

const router = Router();

// POST /api/rooms - Create a new watch party room (Rate-limited to 30 rooms/min per IP)
router.post(
  '/',
  roomCreationRateLimiter,
  validateRequest(createRoomSchema),
  (req, res, next) => roomController.createRoom(req, res, next)
);

// GET /api/rooms/:roomCode - Fetch safe room metadata and authoritative playback state
router.get(
  '/:roomCode',
  validateRequest(getRoomSchema),
  (req, res, next) => roomController.getRoom(req, res, next)
);

// POST /api/rooms/:roomCode/join - Join an existing room via REST before WebSocket handshake
router.post(
  '/:roomCode/join',
  validateRequest(joinRoomSchema),
  (req, res, next) => roomController.joinRoom(req, res, next)
);

export default router;
