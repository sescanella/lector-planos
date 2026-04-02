import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { getPool } from '../db';
import { addExcelGenerationJob } from '../services/queue';
import { getExportPresignedUrl } from '../services/s3';
import { isValidUUID } from '../utils/validation';

const router = Router();

const exportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.header('X-API-Key') || req.ip || 'unknown',
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Export rate limit exceeded. Maximum 5 exports per 15 minutes.' },
});

// POST /:jobId/export — Create export
router.post('/:jobId/export', exportLimiter, async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(500).json({ error: 'internal_error', message: 'Database not available' });
      return;
    }

    const { jobId } = req.params;
    if (!isValidUUID(jobId)) {
      res.status(400).json({ error: 'validation_error', message: 'Invalid job ID format' });
      return;
    }

    // Check job exists
    const { rows: jobRows } = await pool.query(
      'SELECT job_id FROM extraction_job WHERE job_id = $1',
      [jobId]
    );
    if (jobRows.length === 0) {
      res.status(404).json({ error: 'not_found', message: 'Job not found', resource_id: jobId });
      return;
    }

    // Count completed spools (only fully completed, not partial)
    const { rows: spoolCountRows } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM spool s
       JOIN pdf_file f ON f.file_id = s.file_id
       WHERE f.job_id = $1 AND s.extraction_status = 'extracted'`,
      [jobId]
    );
    const spoolCount = spoolCountRows[0].count;
    if (spoolCount === 0) {
      res.status(422).json({
        error: 'no_completed_spools',
        message: 'No completed spools available for export',
      });
      return;
    }

    const includeConfidence = req.body?.include_confidence === true;

    // Idempotency: try insert, on conflict return existing
    const { rows: insertRows } = await pool.query(
      `INSERT INTO excel_export (job_id, spool_count, include_confidence)
       VALUES ($1, $2, $3)
       ON CONFLICT ON CONSTRAINT idx_excel_export_inflight DO NOTHING
       RETURNING export_id, job_id, status, spool_count, include_confidence, created_at`,
      [jobId, spoolCount, includeConfidence]
    );

    if (insertRows.length > 0) {
      // New export created — enqueue BullMQ job
      const exportRow = insertRows[0];
      try {
        await addExcelGenerationJob({
          exportId: exportRow.export_id,
          jobId,
          includeConfidence,
        });
      } catch (err) {
        console.error(`Could not queue excel generation for export ${exportRow.export_id}:`, err);
      }

      res.status(202).json(exportRow);
      return;
    }

    // Conflict — return existing in-flight export
    const { rows: existingRows } = await pool.query(
      `SELECT export_id, job_id, status, spool_count, include_confidence, created_at
       FROM excel_export
       WHERE job_id = $1 AND status IN ('pending', 'processing')
       ORDER BY created_at DESC LIMIT 1`,
      [jobId]
    );

    if (existingRows.length > 0) {
      res.status(200).json(existingRows[0]);
      return;
    }

    // Edge case: conflict but no in-flight row found (race condition)
    res.status(500).json({ error: 'internal_error', message: 'An unexpected error occurred' });
  } catch (err) {
    console.error('Error creating export:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'internal_error', message: 'An unexpected error occurred' });
  }
});

// GET /:jobId/export/:exportId — Get export status
router.get('/:jobId/export/:exportId', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(500).json({ error: 'internal_error', message: 'Database not available' });
      return;
    }

    const { jobId, exportId } = req.params;
    if (!isValidUUID(jobId) || !isValidUUID(exportId)) {
      res.status(400).json({ error: 'validation_error', message: 'Invalid ID format' });
      return;
    }

    const { rows } = await pool.query(
      `SELECT export_id, job_id, status, s3_key, file_size_bytes, spool_count,
              error_message, include_confidence, created_at, completed_at, expires_at
       FROM excel_export
       WHERE export_id = $1 AND job_id = $2`,
      [exportId, jobId]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'not_found', message: 'Export not found', resource_id: exportId });
      return;
    }

    const exp = rows[0];

    // Check expiry
    if (exp.expires_at && new Date(exp.expires_at) < new Date()) {
      res.status(410).json({ error: 'export_expired', message: 'Export has expired' });
      return;
    }

    if (exp.status === 'completed' && exp.s3_key) {
      const jobPrefix = jobId.substring(0, 8);
      const filename = `export-${jobPrefix}-${exp.spool_count}spools.xlsx`;
      const downloadUrl = await getExportPresignedUrl(exp.s3_key, filename);

      res.json({
        export_id: exp.export_id,
        job_id: exp.job_id,
        status: exp.status,
        spool_count: exp.spool_count,
        include_confidence: exp.include_confidence,
        file_size_bytes: exp.file_size_bytes,
        download_url: downloadUrl,
        filename,
        created_at: exp.created_at,
        completed_at: exp.completed_at,
        expires_at: exp.expires_at,
      });
      return;
    }

    if (exp.status === 'failed') {
      res.json({
        export_id: exp.export_id,
        job_id: exp.job_id,
        status: exp.status,
        spool_count: exp.spool_count,
        include_confidence: exp.include_confidence,
        error_message: exp.error_message,
        created_at: exp.created_at,
      });
      return;
    }

    // pending or processing
    res.json({
      export_id: exp.export_id,
      job_id: exp.job_id,
      status: exp.status,
      spool_count: exp.spool_count,
      include_confidence: exp.include_confidence,
      created_at: exp.created_at,
    });
  } catch (err) {
    console.error('Error getting export:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'internal_error', message: 'An unexpected error occurred' });
  }
});

// GET /:jobId/export — List exports
router.get('/:jobId/export', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(500).json({ error: 'internal_error', message: 'Database not available' });
      return;
    }

    const { jobId } = req.params;
    if (!isValidUUID(jobId)) {
      res.status(400).json({ error: 'validation_error', message: 'Invalid job ID format' });
      return;
    }

    const { rows } = await pool.query(
      `SELECT export_id, status, spool_count, include_confidence, created_at, completed_at
       FROM excel_export
       WHERE job_id = $1
       ORDER BY created_at DESC`,
      [jobId]
    );

    res.json({ exports: rows });
  } catch (err) {
    console.error('Error listing exports:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'internal_error', message: 'An unexpected error occurred' });
  }
});

export default router;
