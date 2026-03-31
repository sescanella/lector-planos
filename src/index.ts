import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import { checkDatabaseConnection, getPool, initDatabase } from './db';
import { initQueue, shutdownQueue, startWorker, checkRedisConnection } from './services/queue';
import { checkS3Connection } from './services/s3';
import jobsRouter from './routes/jobs';
import spoolsRouter from './routes/spools';
import { authMiddleware } from './middleware/auth';

const app = express();

app.use(cors({
  origin: env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN.split(','),
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'X-API-Key'],
}));
app.use(express.json({ limit: '100kb' }));

// Hello world
app.get('/', (_req, res) => {
  res.json({
    service: 'BlueprintAI',
    version: '0.1.0',
    status: 'running',
  });
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
// TODO: Add rate limiting before multi-user support (express-rate-limit)
app.use('/api/v1', authMiddleware);
app.use('/api/v1/jobs', jobsRouter);
app.use('/api/v1/spools', spoolsRouter);

// 404 catch-all
app.use((req, res) => {
  res.status(404).json({ error: 'not_found', message: `Route not found: ${req.method} ${req.path}` });
});

async function start() {
  // Initialize services
  await initDatabase();
  await initQueue();

  // Start extraction worker (placeholder processor — will be replaced by REQ-11)
  startWorker(async (job) => {
    console.log(`Processing extraction job: ${job.data.fileId} (${job.data.filename})`);
    // Placeholder: actual extraction logic comes in REQ-10/REQ-11
  });

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
