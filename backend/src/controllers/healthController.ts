import { Request, Response } from 'express';
import { getDatabaseStatus } from '../config/database';

export function getHealth(_req: Request, res: Response): void {
  const dbStatus = getDatabaseStatus();

  res.status(200).json({
    success: true,
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    database: dbStatus,
  });
}
