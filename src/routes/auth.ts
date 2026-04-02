import { Router, Request, Response } from 'express';

const router = Router();

// GET /api/v1/auth/validate — Validate API key (authMiddleware handles the 401)
router.get('/validate', (_req: Request, res: Response) => {
  res.json({ valid: true });
});

export default router;
