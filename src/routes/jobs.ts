import { Router, Request, Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { getPool } from '../db';
import { uploadPdf } from '../services/s3';
import { addExtractionJob } from '../services/queue';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_FILES_PER_JOB = 200;

// POST /api/v1/jobs — Create extraction job
router.post('/', async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) {
    res.status(500).json({ error: 'internal_error', message: 'Database not available' });
    return;
  }

  const { webhook_url } = req.body || {};

  // Validate webhook URL if provided
  if (webhook_url) {
    try {
      const url = new URL(webhook_url);
      if (url.protocol !== 'https:') {
        res.status(400).json({
          error: 'validation_error',
          message: 'Webhook URL must use HTTPS',
          details: [{ field: 'webhook_url', message: 'Must be HTTPS' }],
        });
        return;
      }
    } catch {
      res.status(400).json({
        error: 'validation_error',
        message: 'Invalid webhook URL',
        details: [{ field: 'webhook_url', message: 'Must be a valid URL' }],
      });
      return;
    }
  }

  const { rows } = await pool.query(
    `INSERT INTO extraction_job (webhook_url) VALUES ($1) RETURNING job_id, status, created_at, webhook_url`,
    [webhook_url || null]
  );

  res.status(201).json(rows[0]);
});

// POST /api/v1/jobs/:jobId/upload — Upload PDFs
router.post('/:jobId/upload', upload.array('files', MAX_FILES_PER_JOB), async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) {
    res.status(500).json({ error: 'internal_error', message: 'Database not available' });
    return;
  }

  const jobId = req.params.jobId as string;

  // Check job exists
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

  // Check total file count
  const newTotal = job.file_count + files.length;
  if (newTotal > MAX_FILES_PER_JOB) {
    res.status(400).json({
      error: 'validation_error',
      message: 'Maximum 200 files allowed',
      details: [{ field: 'files', message: `Would have ${newTotal} files, maximum is ${MAX_FILES_PER_JOB}` }],
    });
    return;
  }

  // Validate each file
  for (const file of files) {
    if (file.mimetype !== 'application/pdf') {
      res.status(415).json({
        error: 'invalid_file_type',
        message: 'Only PDF files are accepted',
        file_type: file.mimetype,
      });
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      res.status(413).json({
        error: 'file_too_large',
        message: 'File exceeds maximum size of 50MB',
        file_size_mb: Math.round(file.size / 1024 / 1024),
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

  // Upload files to S3 and create records
  const fileRecords = [];
  for (const file of files) {
    const fileId = uuidv4();
    const s3Key = await uploadPdf(jobId, fileId, file.buffer, file.size);

    await pool.query(
      `INSERT INTO pdf_file (file_id, job_id, original_filename, s3_key, file_size_bytes)
       VALUES ($1, $2, $3, $4, $5)`,
      [fileId, jobId, file.originalname, s3Key, file.size]
    );

    // Queue extraction job
    try {
      await addExtractionJob({
        jobId,
        fileId,
        s3Key,
        filename: file.originalname,
      });
    } catch {
      // Queue not available — file is stored but not queued
      console.warn(`Could not queue extraction for file ${fileId} — queue may not be configured`);
    }

    fileRecords.push({
      file_id: fileId,
      filename: file.originalname,
      status: 'uploaded',
      file_size_bytes: file.size,
    });
  }

  // Update job status and file count
  await pool.query(
    `UPDATE extraction_job SET status = 'processing', file_count = file_count + $1 WHERE job_id = $2`,
    [files.length, jobId]
  );

  res.status(202).json({
    job_id: jobId,
    status: 'processing',
    file_count: newTotal,
    files: fileRecords,
  });
});

// GET /api/v1/jobs/:jobId — Get job status
router.get('/:jobId', async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) {
    res.status(500).json({ error: 'internal_error', message: 'Database not available' });
    return;
  }

  const jobId = req.params.jobId as string;

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

  res.json({
    ...jobRows[0],
    files: fileRows,
  });
});

export default router;
