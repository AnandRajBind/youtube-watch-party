import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/apiError';

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  message?: string;
}

/**
 * Lightweight, dependency-free in-memory rate limiter.
 * Prevents endpoint abuse and brute-force room creation.
 */
export function createRateLimiter(options: RateLimitOptions) {
  const ipRequests = new Map<string, { count: number; resetTime: number }>();

  // Periodically prune expired entries
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of ipRequests.entries()) {
      if (now > record.resetTime) {
        ipRequests.delete(ip);
      }
    }
  }, 60000);

  // unref ensures this interval doesn't hold the Node process open on shutdown or test exit
  if (cleanupTimer.unref) {
    cleanupTimer.unref();
  }

  return (req: Request, _res: Response, next: NextFunction) => {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
    const now = Date.now();

    const record = ipRequests.get(ip);
    if (!record || now > record.resetTime) {
      ipRequests.set(ip, { count: 1, resetTime: now + options.windowMs });
      return next();
    }

    record.count++;
    if (record.count > options.maxRequests) {
      return next(
        new ApiError(
          429,
          options.message || 'Too many requests. Please slow down and try again later.',
          'RATE_LIMIT_EXCEEDED'
        )
      );
    }

    next();
  };
}

// Global API rate limit: 120 requests per minute
export const apiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 120,
  message: 'API rate limit exceeded. Please try again shortly.',
});

// Stricter room creation limiter: 30 rooms per minute per IP
export const roomCreationRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
  message: 'Room creation limit reached. Please wait before creating more rooms.',
});
