import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { roomService } from '../services/roomService';

export class RoomController {
  /**
   * POST /api/rooms
   * Creates a new watch party room.
   * Assigns creator as Host and returns safe room & host details.
   */
  public async createRoom(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { username, initialVideoUrl, userId } = req.body;
      const result = await roomService.createRoom(username, initialVideoUrl, userId);

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/rooms/:roomCode
   * Returns safe room information without exposing internal MongoDB fields.
   */
  public async getRoom(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const roomCode = String(req.params.roomCode);
      const safeRoom = await roomService.getSafeRoomDetails(roomCode);

      res.status(200).json({
        success: true,
        data: safeRoom,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/rooms/:roomCode/join
   * Verifies room existence, creates/re-associates participant identity,
   * assigns Participant role by default, and returns session data for WebSocket initiation.
   */
  public async joinRoom(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const roomCode = String(req.params.roomCode);
      const { username, userId } = req.body;

      // Assign or reuse unique participant identity
      const participantUserId = userId?.trim() || crypto.randomUUID();

      const result = await roomService.joinRoom(roomCode, participantUserId, username);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const roomController = new RoomController();
