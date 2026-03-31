import express from 'express';
import { env } from './config/env';
import { checkDatabaseConnection, getPool, initDatabase } from './db';

const app = express();

app.use(express.json());

app.get('/', (_req, res) => {
  res.json({
    service: 'BlueprintAI',
    version: '0.1.0',
    status: 'running',
  });
});

app.get('/health', async (_req, res) => {
  const dbConnected = await checkDatabaseConnection();
  const status = dbConnected ? 'healthy' : 'degraded';
  res.status(dbConnected ? 200 : 503).json({
    status,
    database: dbConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});

app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path,
  });
});

async function start() {
  await initDatabase();

  const server = app.listen(env.PORT, () => {
    console.log(`BlueprintAI server listening on port ${env.PORT}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`${signal} received — shutting down gracefully`);
    server.close();
    const pool = getPool();
    if (pool) await pool.end();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});

export default app;
