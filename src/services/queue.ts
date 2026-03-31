import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../config/env';

let connection: IORedis | null = null;
let queue: Queue | null = null;
let worker: Worker | null = null;

const QUEUE_NAME = 'pdf-extraction';
const CONCURRENCY = 5;
const JOB_TIMEOUT = 5 * 60 * 1000; // 5 minutes

function getConnection(): IORedis | null {
  if (!env.REDIS_URL) return null;

  if (!connection) {
    connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  }
  return connection;
}

export function getQueue(): Queue | null {
  const conn = getConnection();
  if (!conn) return null;

  if (!queue) {
    queue = new Queue(QUEUE_NAME, { connection: conn });
  }
  return queue;
}

export interface ExtractionJobData {
  jobId: string;
  fileId: string;
  s3Key: string;
  filename: string;
}

export type ProcessorFn = (job: Job<ExtractionJobData>) => Promise<void>;

export function startWorker(processor: ProcessorFn): Worker | null {
  const conn = getConnection();
  if (!conn) return null;

  if (worker) return worker;

  worker = new Worker<ExtractionJobData>(
    QUEUE_NAME,
    processor,
    {
      connection: conn,
      concurrency: CONCURRENCY,
      lockDuration: JOB_TIMEOUT,
    }
  );

  worker.on('completed', (job) => {
    console.log(`Job completed: ${job.id} (file: ${job.data.fileId})`);
  });

  worker.on('failed', (job, err) => {
    console.error(`Job failed: ${job?.id} — ${err.message}`);
  });

  console.log(`BullMQ worker started: queue=${QUEUE_NAME}, concurrency=${CONCURRENCY}`);
  return worker;
}

export async function addExtractionJob(data: ExtractionJobData): Promise<string> {
  const q = getQueue();
  if (!q) throw new Error('Queue not initialized — REDIS_URL not set');

  const job = await q.add('extract-pdf', data, {
    attempts: 3,
    backoff: { type: 'custom', delay: 1000 },
    removeOnComplete: { age: 7 * 24 * 3600 },
    removeOnFail: false,
  });

  console.log(`Queued extraction job: ${job.id} (file: ${data.fileId})`);
  return job.id!;
}

export async function initQueue(): Promise<void> {
  if (!env.REDIS_URL) {
    console.log('REDIS_URL not set — job queue disabled');
    return;
  }

  getQueue();
  console.log(`BullMQ queue initialized: ${QUEUE_NAME}`);
}

export async function shutdownQueue(): Promise<void> {
  if (worker) {
    console.log('Draining BullMQ worker...');
    await worker.close();
    worker = null;
  }
  if (queue) {
    await queue.close();
    queue = null;
  }
  if (connection) {
    await connection.quit();
    connection = null;
  }
}
