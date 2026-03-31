import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

// TODO: Replace with JWT validation for multi-user support
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip auth in development when no API_KEY is configured
  if (!env.API_KEY) {
    next();
    return;
  }

  const apiKey = req.header('X-API-Key');

  if (!apiKey || apiKey !== env.API_KEY) {
    res.status(401).json({
      error: 'unauthorized',
      message: 'Invalid or missing API key',
    });
    return;
  }

  next();
}
