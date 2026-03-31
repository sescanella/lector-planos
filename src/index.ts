import express from 'express';
import { env } from './config/env';

const app = express();

app.use(express.json());

app.get('/', (_req, res) => {
  res.json({
    service: 'BlueprintAI',
    version: '0.1.0',
    status: 'running',
  });
});

app.listen(env.PORT, () => {
  console.log(`BlueprintAI server listening on port ${env.PORT}`);
});

export default app;
