import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { registerRoomHandlers } from './handlers/roomHandler';
import { registerSyncHandlers } from './handlers/syncHandler';
import { registerRoleHandlers } from './handlers/roleHandler';

let io: SocketIOServer | null = null;

export function initSocketServer(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: env.CLIENT_URL,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  logger.info(`Socket.IO initialized with CORS allowed origin: ${env.CLIENT_URL}`);

  io.on('connection', (socket: Socket) => {
    logger.info(`Client connected via Socket.IO: [id=${socket.id}]`);

    // Register all modular event handlers
    registerRoomHandlers(io!, socket);
    registerSyncHandlers(io!, socket);
    registerRoleHandlers(io!, socket);
  });

  return io;
}

export function getIO(): SocketIOServer {
  if (!io) {
    throw new Error('Socket.IO has not been initialized. Call initSocketServer first.');
  }
  return io;
}
