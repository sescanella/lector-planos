import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';
import { env } from '../config/env';

/**
 * API key authentication middleware.
 * In production, API_KEY must be set (enforced by env.ts validation).
 * In development, when API_KEY is empty, auth is skipped with a warning.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!env.API_KEY) {
    if (env.NODE_ENV === 'production') {
      res.status(503).json({
        error: 'configuration_error',
        message: 'Service not properly configured',
      });
      return;
    }
    // Development only: skip auth when no key configured
    next();
    return;
  }

  const apiKey = req.header('X-API-Key');

  if (!apiKey) {
    res.status(401).json({
      error: 'unauthorized',
      message: 'Missing API key',
    });
    return;
  }

  // Timing-safe comparison to prevent timing attacks
  const keyBuffer = Buffer.from(env.API_KEY);
  const providedBuffer = Buffer.from(apiKey);

  if (keyBuffer.length !== providedBuffer.length || !timingSafeEqual(keyBuffer, providedBuffer)) {
    res.status(401).json({
      error: 'unauthorized',
      message: 'Invalid API key',
    });
    return;
  }

  next();
}
