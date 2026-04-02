import { Request, Response, NextFunction } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { env } from '../config/env';

// TODO: Replace with JWT validation for multi-user support
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip auth in development when no API_KEY is configured
  if (!env.API_KEY) {
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

function safeCompare(a: string, b: string): boolean {
  // HMAC both inputs to fixed-length digests — eliminates length side-channel
  const hashA = createHmac('sha256', 'key-compare').update(a).digest();
  const hashB = createHmac('sha256', 'key-compare').update(b).digest();
  return timingSafeEqual(hashA, hashB);
}
