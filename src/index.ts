import express from 'express';
import { env } from './config/env';
import { checkDatabaseConnection, getPool, initDatabase } from './db';
import { initQueue, shutdownQueue, startWorker } from './services/queue';
import jobsRouter from './routes/jobs';
import spoolsRouter from './routes/spools';

const app = express();

app.use(express.json());

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
  const dbConnected = await checkDatabaseConnection();
  const status = dbConnected ? 'healthy' : 'degraded';
  res.status(dbConnected ? 200 : 503).json({
    status,
    database: dbConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});

// API routes
app.use('/api/v1/jobs', jobsRouter);
app.use('/api/v1/spools', spoolsRouter);

// 404 catch-all
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path,
  });
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
    server.close();

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
    shutdown(signal);
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
