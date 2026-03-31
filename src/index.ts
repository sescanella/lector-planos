import express from 'express';
import { env } from './config/env';
import { checkDatabaseConnection, initDatabase } from './db';

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
  res.json({
    status: dbConnected ? 'healthy' : 'degraded',
    database: dbConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});

app.use((_req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: _req.path,
  });
});

async function start() {
  await initDatabase();

  app.listen(env.PORT, () => {
    console.log(`BlueprintAI server listening on port ${env.PORT}`);
  });
}

start();

export default app;
