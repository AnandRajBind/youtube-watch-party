import { Router } from 'express';
import { roomController } from '../controllers/roomController';

const router = Router();

// POST /api/rooms - Create a new watch party room
router.post('/', (req, res, next) => roomController.createRoom(req, res, next));

// GET /api/rooms/:roomCode - Fetch room metadata and current playback state
router.get('/:roomCode', (req, res, next) => roomController.getRoom(req, res, next));

export default router;
