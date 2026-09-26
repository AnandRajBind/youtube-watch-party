import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { registerRoomHandlers } from './handlers/roomHandler';
import { registerSyncHandlers } from './handlers/syncHandler';
import { registerRoleHandlers } from './handlers/roleHandler';
import { CustomSocket } from './socketTypes';

let io: SocketIOServer | null = null;

/**
 * Initializes and attaches the Socket.IO server to the HTTP server.
 */
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

  logger.info(`Socket.IO Server initialized with CORS origin: ${env.CLIENT_URL}`);

  io.on('connection', (socket: CustomSocket) => {
    logger.info(`New socket connection established: [id=${socket.id}]`);

    // Register room membership and session handlers
    registerRoomHandlers(io!, socket);

    // Register server-side playback synchronization handlers
    registerSyncHandlers(io!, socket);

    // Register role-based access control and member management handlers
    registerRoleHandlers(io!, socket);
  });

  return io;
}

/**
 * Returns the active Socket.IO server instance.
 */
export function getIO(): SocketIOServer {
  if (!io) {
    throw new Error('Socket.IO has not been initialized. Call initSocketServer first.');
  }
  return io;
}

export * from './socketTypes';
export * from './roomSocket';
