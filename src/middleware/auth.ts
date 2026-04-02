import { Request, Response, NextFunction } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { env } from '../config/env';

/**
 * Timing-safe string comparison using HMAC digests.
 * HMAC both inputs to fixed-length digests — eliminates length side-channel.
 */
function safeCompare(a: string, b: string): boolean {
  const hashA = createHmac('sha256', 'key-compare').update(a).digest();
  const hashB = createHmac('sha256', 'key-compare').update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

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

  if (!apiKey || !safeCompare(apiKey, env.API_KEY)) {
    res.status(401).json({
      error: 'unauthorized',
      message: 'Invalid or missing API key',
    });
    return;
  }

  next();
}
