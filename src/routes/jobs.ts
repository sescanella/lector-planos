import { Router, Request, Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { getPool } from '../db';
import { uploadPdf, deletePdf } from '../services/s3';
import { addExtractionJob } from '../services/queue';
import { isValidUUID } from '../utils/validation';

const router = Router();

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB — max file size per REQ-9 spec
const MAX_FILES_PER_JOB = 200;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES_PER_JOB },
});

// POST /api/v1/jobs — Create extraction job
router.post('/', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(500).json({ error: 'internal_error', message: 'Database not available' });
      return;
    }

    // TODO: Implement webhook allowlist (WEBHOOK_ALLOWED_DOMAINS) before enabling webhooks
    // Webhook URL is accepted but ignored until allowlist is in place
    const _webhookUrl = (req.body || {}).webhook_url; // eslint-disable-line @typescript-eslint/no-unused-vars

    const { rows } = await pool.query(
      `INSERT INTO extraction_job (webhook_url) VALUES ($1) RETURNING job_id, status, created_at, webhook_url`,
      [null]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error creating job:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'internal_error', message: 'An unexpected error occurred' });
  }
});

// POST /api/v1/jobs/:jobId/upload — Upload PDFs
router.post('/:jobId/upload', upload.array('files', MAX_FILES_PER_JOB), async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(500).json({ error: 'internal_error', message: 'Database not available' });
      return;
    }

    const jobId = req.params.jobId as string;
    if (!isValidUUID(jobId)) {
      res.status(400).json({ error: 'validation_error', message: 'Invalid job ID format' });
      return;
    }

    // TODO: Move this SELECT inside the transaction with FOR UPDATE when supporting concurrent uploads
    const { rows: jobRows } = await pool.query(
      'SELECT job_id, status, file_count FROM extraction_job WHERE job_id = $1',
      [jobId]
    );

    if (jobRows.length === 0) {
      res.status(404).json({ error: 'not_found', message: 'Resource not found', resource_id: jobId });
      return;
    }

    const job = jobRows[0];

    if (job.status === 'completed' || job.status === 'failed') {
      res.status(409).json({
        error: 'invalid_state',
        message: `Cannot upload files to a job that is already ${job.status}`,
        current_status: job.status,
      });
      return;
    }

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({
        error: 'validation_error',
        message: 'No files provided',
        details: [{ field: 'files', message: 'At least one file is required' }],
      });
      return;
    }

    const newTotal = job.file_count + files.length;
    if (newTotal > MAX_FILES_PER_JOB) {
      res.status(400).json({
        error: 'validation_error',
        message: 'Maximum 200 files allowed',
        details: [{ field: 'files', message: `Would have ${newTotal} files, maximum is ${MAX_FILES_PER_JOB}` }],
      });
      return;
    }

    for (const file of files) {
      if (file.mimetype !== 'application/pdf') {
        res.status(415).json({
          error: 'invalid_file_type',
          message: 'Only PDF files are accepted',
          file_type: file.mimetype,
          filename: file.originalname,
        });
        return;
      }
      const pdfMagicBytes = file.buffer.slice(0, 5).toString();
      if (pdfMagicBytes !== '%PDF-') {
        res.status(415).json({
          error: 'invalid_file_content',
          message: 'File does not appear to be a valid PDF',
          filename: file.originalname,
        });
        return;
      }
      if (file.size === 0) {
        res.status(400).json({
          error: 'validation_error',
          message: 'Empty file',
          details: [{ field: 'files', message: 'File must not be empty' }],
        });
        return;
      }
    }

    // Upload files with S3+DB transaction safety
    const fileRecords = [];
    const uploadedS3Keys: { jobId: string; fileId: string }[] = [];
    const pendingJobs: { jobId: string; fileId: string; s3Key: string; filename: string }[] = [];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const file of files) {
        const fileId = uuidv4();
        const s3Key = await uploadPdf(jobId, fileId, file.buffer, file.size);
        uploadedS3Keys.push({ jobId, fileId });

        await client.query(
          `INSERT INTO pdf_file (file_id, job_id, original_filename, s3_key, file_size_bytes)
           VALUES ($1, $2, $3, $4, $5)`,
          [fileId, jobId, file.originalname, s3Key, file.size]
        );

        pendingJobs.push({ jobId, fileId, s3Key, filename: file.originalname });

        fileRecords.push({
          file_id: fileId,
          filename: file.originalname,
          status: 'uploaded',
          file_size_bytes: file.size,
        });
      }

      await client.query(
        `UPDATE extraction_job SET status = 'processing', file_count = file_count + $1 WHERE job_id = $2`,
        [files.length, jobId]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      // Clean up orphaned S3 objects
      for (const key of uploadedS3Keys) {
        try {
          await deletePdf(key.jobId, key.fileId);
        } catch {
          console.error(`Failed to clean up S3 object: uploads/${key.jobId}/${key.fileId}.pdf`);
        }
      }
      throw err;
    } finally {
      client.release();
    }

    // Enqueue extraction jobs after successful commit
    for (const pending of pendingJobs) {
      try {
        await addExtractionJob(pending);
      } catch (err) {
        console.error(`Could not queue extraction for file ${pending.fileId} — queue may not be configured:`, err);
      }
    }

    res.status(202).json({
      job_id: jobId,
      status: 'processing',
      file_count: newTotal,
      files: fileRecords,
    });
  } catch (err) {
    console.error('Error uploading files:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'internal_error', message: 'An unexpected error occurred' });
  }
});

// GET /api/v1/jobs/:jobId — Get job status
router.get('/:jobId', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(500).json({ error: 'internal_error', message: 'Database not available' });
      return;
    }

    const jobId = req.params.jobId as string;
    if (!isValidUUID(jobId)) {
      res.status(400).json({ error: 'validation_error', message: 'Invalid job ID format' });
      return;
    }

    const { rows: jobRows } = await pool.query(
      'SELECT job_id, status, created_at, completed_at, file_count, processed_count, webhook_url FROM extraction_job WHERE job_id = $1',
      [jobId]
    );

    if (jobRows.length === 0) {
      res.status(404).json({ error: 'not_found', message: 'Resource not found', resource_id: jobId });
      return;
    }

    const { rows: fileRows } = await pool.query(
      'SELECT file_id, original_filename AS filename, status, page_count FROM pdf_file WHERE job_id = $1 ORDER BY uploaded_at',
      [jobId]
    );

    res.json({ ...jobRows[0], files: fileRows });
  } catch (err) {
    console.error('Error getting job:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'internal_error', message: 'An unexpected error occurred' });
  }
});

export default router;
