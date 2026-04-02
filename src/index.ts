import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { env } from './config/env';
import { checkDatabaseConnection, getPool, initDatabase } from './db';
import { initQueue, shutdownQueue, startWorker, checkRedisConnection } from './services/queue';
import { checkS3Connection } from './services/s3';
import jobsRouter from './routes/jobs';
import spoolsRouter from './routes/spools';
import { authMiddleware } from './middleware/auth';
import { createPdfExtractionProcessor } from './workers/pdf-extraction';
import { createExcelGenerationProcessor } from './workers/excel-generation';
import { startExcelWorker } from './services/queue';
import exportRouter from './routes/export';

const app = express();

app.use(cors({
  origin: env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN.split(','),
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'X-API-Key'],
}));
app.use(express.json({ limit: '100kb' }));

// Serve config.js with embedded API key for frontend auth
app.get('/config.js', (_req, res) => {
  const safeKey = env.API_KEY.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  res.type('application/javascript').send(
    'window.__blueprintConfig={apiKey:"' + safeKey + '"};'
  );
});

// Serve static frontend files (public/index.html serves at /)
// Service info is available at GET /health
app.use(express.static(path.join(__dirname, '..', 'public')));

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
// TODO: Add rate limiting before multi-user support (express-rate-limit)
app.use('/api/v1', authMiddleware);
app.use('/api/v1/jobs', jobsRouter);
app.use('/api/v1/spools', spoolsRouter);
app.use('/api/v1/jobs', exportRouter);

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

async function start() {
  // Initialize services
  await initDatabase();
  await initQueue();

  // Start PDF extraction worker (REQ-10 pipeline)
  startWorker(createPdfExtractionProcessor());

  // Start Excel generation worker (REQ-12 pipeline)
  startExcelWorker(createExcelGenerationProcessor());

  const server = app.listen(env.PORT, () => {
    console.log(`BlueprintAI server listening on port ${env.PORT}`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`${signal} received — shutting down gracefully`);

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
