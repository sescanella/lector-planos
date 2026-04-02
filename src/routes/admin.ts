import { Router, Request, Response } from 'express';
import { getDlqQueue, getAiDlqQueue } from '../services/queue';

const router = Router();

// GET /api/v1/admin/dlq — List DLQ entries
router.get('/dlq', async (_req: Request, res: Response) => {
  try {
    const results: Record<string, any[]> = { pdf: [], ai: [] };

    const pdfDlq = getDlqQueue();
    if (pdfDlq) {
      const jobs = await pdfDlq.getJobs(['waiting', 'delayed', 'failed'], 0, 50);
      results.pdf = jobs.map(j => ({
        id: j.id,
        data: j.data,
        timestamp: j.timestamp,
        failedReason: j.failedReason,
      }));
    }

    const aiDlq = getAiDlqQueue();
    if (aiDlq) {
      const jobs = await aiDlq.getJobs(['waiting', 'delayed', 'failed'], 0, 50);
      results.ai = jobs.map(j => ({
        id: j.id,
        data: j.data,
        timestamp: j.timestamp,
        failedReason: j.failedReason,
      }));
    }

    res.json({
      pdf_dlq_count: results.pdf.length,
      ai_dlq_count: results.ai.length,
      entries: results,
    });
  } catch (err) {
    console.error('Error listing DLQ:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'internal_error', message: 'Failed to list DLQ entries' });
  }
});

// GET /api/v1/admin/dlq/stats — Quick DLQ counts
router.get('/dlq/stats', async (_req: Request, res: Response) => {
  try {
    const pdfDlq = getDlqQueue();
    const aiDlq = getAiDlqQueue();

    const [pdfCount, aiCount] = await Promise.all([
      pdfDlq ? pdfDlq.getJobCounts('waiting', 'delayed', 'failed') : { waiting: 0, delayed: 0, failed: 0 },
      aiDlq ? aiDlq.getJobCounts('waiting', 'delayed', 'failed') : { waiting: 0, delayed: 0, failed: 0 },
    ]);

    res.json({ pdf_dlq: pdfCount, ai_dlq: aiCount });
  } catch (err) {
    console.error('Error getting DLQ stats:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'internal_error', message: 'Failed to get DLQ stats' });
  }
});

export default router;
