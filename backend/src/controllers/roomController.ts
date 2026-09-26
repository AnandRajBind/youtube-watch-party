import { Request, Response, NextFunction } from 'express';
import { roomService } from '../services/roomService';

export class RoomController {
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

  public async getRoom(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const roomCode = String(req.params.roomCode);
      const room = await roomService.getRoomByCode(roomCode);

      res.status(200).json({
        success: true,
        data: room,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const roomController = new RoomController();
