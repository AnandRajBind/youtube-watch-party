import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import healthRoutes from './routes/healthRoutes';
import roomRoutes from './routes/roomRoutes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

const app: Application = express();

// 1. Security headers
app.use(helmet());

// 2. Cross-Origin Resource Sharing
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// 3. HTTP Request Logging
app.use(morgan(env.NODE_ENV === 'development' ? 'dev' : 'combined'));

// 4. Body parsing middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 5. Application Routes
app.use('/api/health', healthRoutes);
app.use('/api/rooms', roomRoutes);

// 6. Handle unmapped routes (404)
app.use(notFoundHandler);

// 7. Centralized Error Handler (must be registered last)
app.use(errorHandler);

export default app;
