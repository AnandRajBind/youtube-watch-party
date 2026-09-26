import http from 'http';
import app from './app';
import { env } from './config/env';
import { connectDatabase, disconnectDatabase } from './config/database';
import { initSocketServer } from './sockets/socketServer';
import { logger } from './utils/logger';

const httpServer = http.createServer(app);

// Attach Socket.IO server to HTTP server
const io = initSocketServer(httpServer);

async function startServer(): Promise<void> {
  try {
    // 1. Connect to MongoDB
    logger.info('Connecting to MongoDB...');
    try {
      await connectDatabase();
    } catch (dbError) {
      logger.error('Initial MongoDB connection failed. Server will continue running, but DB-dependent routes may fail.', dbError);
    }

    // 2. Start HTTP & WebSocket server
    httpServer.listen(env.PORT, () => {
      logger.info(`====================================================`);
      logger.info(` YouTube Watch Party Backend Service`);
      logger.info(` Environment: ${env.NODE_ENV}`);
      logger.info(` HTTP Server: http://localhost:${env.PORT}`);
      logger.info(` Health Check: http://localhost:${env.PORT}/api/health`);
      logger.info(` Allowed CORS: ${env.CLIENT_URL}`);
      logger.info(`====================================================`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown handling
async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  // 1. Stop accepting new HTTP/Socket connections
  httpServer.close(() => {
    logger.info('HTTP server closed.');
  });

  // 2. Close Socket.IO connections
  io.close(() => {
    logger.info('Socket.IO server closed.');
  });

  // 3. Disconnect from database
  await disconnectDatabase();

  logger.info('Graceful shutdown complete. Exiting process.');
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception thrown:', error);
  process.exit(1);
});

void startServer();
