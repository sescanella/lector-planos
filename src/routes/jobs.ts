import { Router, Request, Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { createReadStream } from 'fs';
import { getPool } from '../db';
import { uploadPdf, deletePdf, deleteByPrefix, deleteS3Object } from '../services/s3';
import { addExtractionJob } from '../services/queue';
import { isValidUUID } from '../utils/validation';

const router = Router();

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB — max file size per REQ-9 spec
const MAX_FILES_PER_JOB = 200;

const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, file, cb) => {
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `upload-${uniqueSuffix}${path.extname(file.originalname)}`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype === 'application/pdf');
  },
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES_PER_JOB },
});

const cleanupFiles = async (files: Express.Multer.File[]) => {
  for (const file of files) {
    if (file.path) {
      await fs.unlink(file.path).catch(() => {});
    }
  }
};

// POST /api/v1/jobs — Create extraction job
router.post('/', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(500).json({ error: 'internal_error', message: 'Database not available' });
      return;
    }

    // Validate optional name field
    const name: string | null = req.body?.name ?? null;
    if (name !== null) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        res.status(400).json({
          error: 'validation_error',
          message: 'Invalid name',
          details: [{ field: 'name', message: 'name must be a non-empty string' }],
        });
        return;
      }
      if (name.length > 255) {
        res.status(400).json({
          error: 'validation_error',
          message: 'Invalid name',
          details: [{ field: 'name', message: 'name must be 255 characters or less' }],
        });
        return;
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO extraction_job (webhook_url, name) VALUES ($1, $2) RETURNING job_id, status, created_at, webhook_url, name`,
      [null, name]
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

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({
        error: 'validation_error',
        message: 'No files provided',
        details: [{ field: 'files', message: 'At least one file is required' }],
      });
      return;
    }

    try {
      // Validate files (mimetype, magic bytes, size, filename length) before opening transaction
      const MAX_FILENAME_LENGTH = 255;
      for (const file of files) {
        if (file.originalname.length > MAX_FILENAME_LENGTH) {
          await cleanupFiles(files);
          res.status(400).json({
            error: 'validation_error',
            message: 'Filename too long',
            details: [{ field: 'files', message: `Filename must be ${MAX_FILENAME_LENGTH} characters or less` }],
          });
          return;
        }
        if (file.mimetype !== 'application/pdf') {
          await cleanupFiles(files);
          res.status(415).json({
            error: 'invalid_file_type',
            message: 'Only PDF files are accepted',
            file_type: file.mimetype,
            filename: file.originalname,
          });
          return;
        }
        // Read only first 5 bytes from disk instead of holding entire file in memory
        const fd = await fs.open(file.path, 'r');
        const headerBuf = Buffer.alloc(5);
        await fd.read(headerBuf, 0, 5, 0);
        await fd.close();
        const pdfMagicBytes = headerBuf.toString();
        if (pdfMagicBytes !== '%PDF-') {
          await cleanupFiles(files);
          res.status(415).json({
            error: 'invalid_file_content',
            message: 'File does not appear to be a valid PDF',
            filename: file.originalname,
          });
          return;
        }
        if (file.size === 0) {
          await cleanupFiles(files);
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
      let newTotal = 0;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Lock the job row to prevent concurrent upload races
        const { rows: jobRows } = await client.query(
          'SELECT job_id, status, file_count FROM extraction_job WHERE job_id = $1 FOR UPDATE',
          [jobId]
        );

        if (jobRows.length === 0) {
          await client.query('ROLLBACK');
          client.release();
          await cleanupFiles(files);
          res.status(404).json({ error: 'not_found', message: 'Resource not found', resource_id: jobId });
          return;
        }

        const job = jobRows[0];

        if (job.status === 'completed' || job.status === 'failed') {
          await client.query('ROLLBACK');
          client.release();
          await cleanupFiles(files);
          res.status(409).json({
            error: 'invalid_state',
            message: `Cannot upload files to a job that is already ${job.status}`,
            current_status: job.status,
          });
          return;
        }

        newTotal = job.file_count + files.length;
        if (newTotal > MAX_FILES_PER_JOB) {
          await client.query('ROLLBACK');
          client.release();
          await cleanupFiles(files);
          res.status(400).json({
            error: 'validation_error',
            message: 'Maximum 200 files allowed',
            details: [{ field: 'files', message: `Would have ${newTotal} files, maximum is ${MAX_FILES_PER_JOB}` }],
          });
          return;
        }

        for (const file of files) {
          const fileId = uuidv4();
          const stream = createReadStream(file.path);
          const s3Key = await uploadPdf(jobId, fileId, stream, file.size);
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
    } finally {
      // Always clean up temp files from disk, regardless of success or failure
      await cleanupFiles(files);
    }
  } catch (err) {
    console.error('Error uploading files:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'internal_error', message: 'An unexpected error occurred' });
  }
});

// GET /api/v1/jobs — List all extraction jobs (paginated)
router.get('/', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(500).json({ error: 'internal_error', message: 'Database not available' });
      return;
    }

    // Parse and validate pagination params
    const rawPage = parseInt((req.query.page as string) || '1', 10);
    const rawLimit = parseInt((req.query.limit as string) || '20', 10);

    if (isNaN(rawPage) || rawPage < 1) {
      res.status(400).json({
        error: 'validation_error',
        message: 'Invalid pagination parameters',
        details: [{ field: 'page', message: 'page must be an integer >= 1' }],
      });
      return;
    }
    if (isNaN(rawLimit) || rawLimit < 1 || rawLimit > 100) {
      res.status(400).json({
        error: 'validation_error',
        message: 'Invalid pagination parameters',
        details: [{ field: 'limit', message: 'limit must be an integer between 1 and 100' }],
      });
      return;
    }

    const page = rawPage;
    const limit = rawLimit;
    const offset = (page - 1) * limit;

    const { rows: countRows } = await pool.query(
      'SELECT COUNT(*)::int AS total FROM extraction_job'
    );
    const total: number = countRows[0].total;
    const total_pages = Math.ceil(total / limit);

    const { rows: jobs } = await pool.query(
      `SELECT job_id, name, status, created_at, completed_at, file_count, processed_count, webhook_url
       FROM extraction_job
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({
      jobs,
      pagination: {
        page,
        limit,
        total,
        total_pages,
      },
    });
  } catch (err) {
    console.error('Error listing jobs:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'internal_error', message: 'An unexpected error occurred' });
  }
});

// GET /api/v1/jobs/:jobId/spools — List all spools for a job (paginated)
router.get('/:jobId/spools', async (req: Request, res: Response) => {
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

    // Parse and validate pagination params
    const rawPage = parseInt((req.query.page as string) || '1', 10);
    const rawLimit = parseInt((req.query.limit as string) || '20', 10);

    if (isNaN(rawPage) || rawPage < 1) {
      res.status(400).json({
        error: 'validation_error',
        message: 'Invalid pagination parameters',
        details: [{ field: 'page', message: 'page must be an integer >= 1' }],
      });
      return;
    }
    if (isNaN(rawLimit) || rawLimit < 1 || rawLimit > 100) {
      res.status(400).json({
        error: 'validation_error',
        message: 'Invalid pagination parameters',
        details: [{ field: 'limit', message: 'limit must be an integer between 1 and 100' }],
      });
      return;
    }

    const page = rawPage;
    const limit = rawLimit;
    const offset = (page - 1) * limit;

    // Verify job exists
    const { rows: jobRows } = await pool.query(
      'SELECT job_id FROM extraction_job WHERE job_id = $1',
      [jobId]
    );
    if (jobRows.length === 0) {
      res.status(404).json({ error: 'not_found', message: 'Job not found', resource_id: jobId });
      return;
    }

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM spool s
       JOIN pdf_file f ON f.file_id = s.file_id
       WHERE f.job_id = $1`,
      [jobId]
    );
    const total: number = countRows[0].total;
    const total_pages = Math.ceil(total / limit);

    const { rows: spoolRows } = await pool.query(
      `SELECT s.spool_id, s.spool_number, s.confidence_score, s.extraction_status, s.file_id, s.created_at
       FROM spool s
       JOIN pdf_file f ON f.file_id = s.file_id
       WHERE f.job_id = $1
       ORDER BY s.spool_number ASC
       LIMIT $2 OFFSET $3`,
      [jobId, limit, offset]
    );

    res.json({
      spools: spoolRows,
      pagination: {
        page,
        limit,
        total,
        total_pages,
      },
    });
  } catch (err) {
    console.error('Error listing spools for job:', err instanceof Error ? err.message : err);
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
      'SELECT job_id, name, status, created_at, completed_at, file_count, processed_count, webhook_url FROM extraction_job WHERE job_id = $1',
      [jobId]
    );

    if (jobRows.length === 0) {
      res.status(404).json({ error: 'not_found', message: 'Resource not found', resource_id: jobId });
      return;
    }

    const { rows: fileRows } = await pool.query(
      'SELECT file_id, original_filename AS filename, status, page_count, failed_pages, file_size_bytes FROM pdf_file WHERE job_id = $1 ORDER BY uploaded_at',
      [jobId]
    );

    res.json({ ...jobRows[0], files: fileRows });
  } catch (err) {
    console.error('Error getting job:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'internal_error', message: 'An unexpected error occurred' });
  }
});

// DELETE /api/v1/jobs/:jobId — Delete a job and all associated data
router.delete('/:jobId', async (req: Request, res: Response) => {
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

    // Check job exists and its status
    const { rows: jobRows } = await pool.query(
      'SELECT job_id, status, file_count FROM extraction_job WHERE job_id = $1',
      [jobId]
    );

    if (jobRows.length === 0) {
      res.status(404).json({ error: 'not_found', message: 'Resource not found', resource_id: jobId });
      return;
    }

    const job = jobRows[0];

    // Block deletion of jobs that are currently processing
    if (job.status === 'processing' || job.status === 'pending') {
      res.status(409).json({
        error: 'invalid_state',
        message: 'No se puede eliminar una OT que está en proceso. Espera a que termine.',
        current_status: job.status,
      });
      return;
    }

    // 1. Collect export S3 keys before CASCADE deletes them
    const { rows: exports } = await pool.query(
      "SELECT s3_key FROM excel_export WHERE job_id = $1 AND s3_key IS NOT NULL",
      [jobId]
    );

    // 2. Clean up S3: all uploads (PDFs + page images) under uploads/{jobId}/
    try {
      await deleteByPrefix(`uploads/${jobId}/`);
    } catch (err) {
      console.error(`S3 cleanup failed for uploads/${jobId}/:`, (err as Error).message);
      // Continue — DB cleanup is more important than S3 cleanup
    }

    // 3. Clean up S3: export files
    for (const exp of exports) {
      try {
        await deleteS3Object(exp.s3_key);
      } catch (err) {
        console.error(`S3 cleanup failed for export ${exp.s3_key}:`, (err as Error).message);
      }
    }

    // 4. Delete from DB (CASCADE handles all child tables)
    await pool.query('DELETE FROM extraction_job WHERE job_id = $1', [jobId]);

    console.log(`Job deleted: ${jobId} (${job.file_count} files)`);
    res.status(204).send();
  } catch (err) {
    console.error('Error deleting job:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'internal_error', message: 'An unexpected error occurred' });
  }
});

export default router;
