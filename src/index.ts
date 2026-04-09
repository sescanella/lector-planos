import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { env } from './config/env';
import { checkDatabaseConnection, getPool, initDatabase } from './db';
import { initQueue, shutdownQueue, startWorker, startAiWorker, startExcelWorker, checkRedisConnection, addAiExtractionJob, addExtractionJob } from './services/queue';
import { checkS3Connection } from './services/s3';
import jobsRouter from './routes/jobs';
import spoolsRouter from './routes/spools';
import adminRouter from './routes/admin';
import authRouter from './routes/auth';
import { authMiddleware } from './middleware/auth';
import { createPdfExtractionProcessor } from './workers/pdf-extraction';
import { createAiExtractionProcessor } from './workers/ai-extraction';
import { createExcelGenerationProcessor } from './workers/excel-generation';
import exportRouter from './routes/export';

const app = express();
app.set('trust proxy', 1);

app.use(cors({
  origin: env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN.split(',').map(s => s.trim()).filter(Boolean),
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'X-API-Key'],
}));
app.use(express.json({ limit: '100kb' }));

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "https://fonts.googleapis.com", "'unsafe-inline'"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
    },
  },
  frameguard: { action: 'deny' },
}));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many requests, please try again later' },
});
app.use('/api/v1', apiLimiter);

// Service info
app.get('/', (_req, res) => {
  res.json({ service: 'lector-planos', version: '1.0.0' });
});

// Health check
app.get('/health', async (_req, res) => {
  const [dbConnected, redisConnected, s3Connected] = await Promise.all([
    checkDatabaseConnection(),
    checkRedisConnection(),
    checkS3Connection(),
  ]);
  const allHealthy = dbConnected && redisConnected && s3Connected;
  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'healthy' : 'degraded',
    database: dbConnected ? 'connected' : 'disconnected',
    redis: redisConnected ? 'connected' : 'disconnected',
    s3: s3Connected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});

// API routes
app.use('/api/v1', authMiddleware);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/jobs', jobsRouter);
app.use('/api/v1/spools', spoolsRouter);
app.use('/api/v1/jobs', exportRouter);
app.use('/api/v1/admin', adminRouter);

// Multer error-handling middleware
app.use((err: Error, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        res.status(413).json({ error: 'file_too_large', message: 'File exceeds maximum size of 50MB' });
        return;
      case 'LIMIT_FILE_COUNT':
        res.status(400).json({ error: 'validation_error', message: 'Maximum 200 files per upload' });
        return;
      case 'LIMIT_UNEXPECTED_FILE':
        res.status(400).json({ error: 'validation_error', message: 'Unexpected file field' });
        return;
      default:
        res.status(400).json({ error: 'upload_error', message: err.message });
        return;
    }
  }
  next(err);
});

// 404 catch-all
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'not_found', message: `Route not found: ${req.method} ${req.path}` });
});

async function recoverStaleJobs(): Promise<void> {
  const pool = getPool();
  if (!pool) return;

  // Advisory lock to prevent concurrent recovery across instances
  const RECOVERY_LOCK_ID = 73910; // arbitrary unique constant
  const { rows: lockRows } = await pool.query('SELECT pg_try_advisory_lock($1) AS acquired', [RECOVERY_LOCK_ID]);
  if (!lockRows[0]?.acquired) {
    console.log('Stale recovery: another instance holds the lock — skipping');
    return;
  }

  try {

  // Recover spools stuck in 'processing' for > 10 min
  const { rows: staleSpools } = await pool.query(
    `UPDATE spool
     SET vision_status = 'pending', vision_processing_started_at = NULL
     WHERE vision_status = 'processing'
       AND vision_processing_started_at < NOW() - INTERVAL '10 minutes'
     RETURNING spool_id, file_id,
       (SELECT pf.job_id FROM pdf_file pf WHERE pf.file_id = spool.file_id) as job_id,
       image_s3_key, image_format, page_number`,
  );
  if (staleSpools.length > 0) {
    console.log(`Recovered ${staleSpools.length} stale AI extraction jobs — re-enqueueing`);
    for (const row of staleSpools) {
      try {
        await addAiExtractionJob({
          spoolId: row.spool_id,
          imageS3Key: row.image_s3_key || '',
          imageFormat: row.image_format || 'png',
          pageNumber: row.page_number || 1,
          fileId: row.file_id,
          jobId: row.job_id,
        });
      } catch (err) {
        console.error(`Failed to re-enqueue stale spool ${row.spool_id}:`, (err as Error).message);
      }
    }
  }

  // Recover pdf_files stuck in 'processing' for > 10 min
  const { rows: staleFiles } = await pool.query(
    `UPDATE pdf_file
     SET status = 'uploaded'
     WHERE status = 'processing'
       AND processing_started_at < NOW() - INTERVAL '10 minutes'
     RETURNING file_id, job_id, s3_key, original_filename`,
  );
  if (staleFiles.length > 0) {
    console.log(`Recovered ${staleFiles.length} stale PDF files — re-enqueueing`);
    for (const row of staleFiles) {
      try {
        await addExtractionJob({
          jobId: row.job_id,
          fileId: row.file_id,
          s3Key: row.s3_key,
          filename: row.original_filename,
        });
      } catch (err) {
        console.error(`Failed to re-enqueue stale file ${row.file_id}:`, (err as Error).message);
      }
    }
  }

  } finally {
    await pool.query('SELECT pg_advisory_unlock($1)', [RECOVERY_LOCK_ID]);
  }
}

async function start() {
  // Initialize services
  await initDatabase();
  await initQueue();

  // Start PDF extraction worker (REQ-10 pipeline)
  startWorker(createPdfExtractionProcessor());

  // Start AI extraction worker (REQ-11 pipeline)
  startAiWorker(createAiExtractionProcessor());

  // Start Excel generation worker (REQ-12 pipeline)
  startExcelWorker(createExcelGenerationProcessor());

  // Run stale recovery at startup
  await recoverStaleJobs();

  // Run stale recovery every 5 minutes
  const staleRecoveryInterval = setInterval(() => {
    recoverStaleJobs().catch(err =>
      console.error('Stale recovery error:', (err as Error).message)
    );
  }, 5 * 60_000);
  staleRecoveryInterval.unref(); // Don't prevent process exit

  // Bind to 0.0.0.0 explicitly so Railway's healthcheck can reach it.
  // Without a host, Node may bind to ::1 only in some environments.
  const server = app.listen(env.PORT, '0.0.0.0', () => {
    console.log(`BlueprintAI server listening on 0.0.0.0:${env.PORT}`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`${signal} received — shutting down gracefully`);

    // 0. Stop periodic stale recovery
    clearInterval(staleRecoveryInterval);

    // 1. Stop accepting new connections
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });

    // 2. Drain BullMQ workers and close Redis
    await shutdownQueue();

    // 3. Close database pool
    const pool = getPool();
    if (pool) await pool.end();

    console.log('Shutdown complete');
    process.exit(0);
  };

  // Force exit after 30 seconds
  const forceShutdown = (signal: string) => {
    shutdown(signal).catch(err => console.error('Shutdown error:', err));
    setTimeout(() => {
      console.error('Forced shutdown after 30s timeout');
      process.exit(1);
    }, 30000).unref();
  };

  process.on('SIGTERM', () => forceShutdown('SIGTERM'));
  process.on('SIGINT', () => forceShutdown('SIGINT'));
}

start().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});

export default app;
