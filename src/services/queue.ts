import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../config/env';

let queueConnection: IORedis | null = null;
let workerConnection: IORedis | null = null;
let excelWorkerConnection: IORedis | null = null;
let queue: Queue | null = null;
let worker: Worker | null = null;
let excelWorker: Worker | null = null;
let aiExtractionQueue: Queue | null = null;
let dlqQueue: Queue | null = null;
let excelGenerationQueue: Queue | null = null;

const QUEUE_NAME = 'pdf-extraction';
const AI_EXTRACTION_QUEUE = 'ai-extraction';
const DLQ_QUEUE = 'pdf-extraction-dlq';
const EXCEL_GENERATION_QUEUE = 'excel-generation';
const CONCURRENCY = env.WORKER_CONCURRENCY;
const JOB_TIMEOUT = 5 * 60 * 1000; // 5 minutes

function createConnection(): IORedis | null {
  if (!env.REDIS_URL) return null;
  const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  connection.on('error', (err) => console.error('Redis connection error:', err));
  return connection;
}

export function getQueue(): Queue | null {
  if (!env.REDIS_URL) return null;

  if (!queue) {
    queueConnection = createConnection()!;
    queue = new Queue(QUEUE_NAME, { connection: queueConnection });
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
  if (!env.REDIS_URL) return null;
  if (worker) return worker;

  workerConnection = createConnection()!;

  worker = new Worker<ExtractionJobData>(
    QUEUE_NAME,
    processor,
    {
      connection: workerConnection,
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
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: { age: 7 * 24 * 3600 },
  });

  console.log(`Queued extraction job: ${job.id} (file: ${data.fileId})`);
  return job.id!;
}

export interface AiExtractionJobData {
  spoolId: string;
  imageS3Key: string;
  imageFormat: string;
  pageNumber: number;
  fileId: string;
  jobId: string;
}

function getAiExtractionQueue(): Queue | null {
  if (!env.REDIS_URL) return null;
  if (!aiExtractionQueue) {
    if (!queueConnection) queueConnection = createConnection()!;
    aiExtractionQueue = new Queue(AI_EXTRACTION_QUEUE, { connection: queueConnection });
  }
  return aiExtractionQueue;
}

export function getDlqQueue(): Queue | null {
  if (!env.REDIS_URL) return null;
  if (!dlqQueue) {
    if (!queueConnection) queueConnection = createConnection()!;
    dlqQueue = new Queue(DLQ_QUEUE, { connection: queueConnection });
  }
  return dlqQueue;
}

export async function addAiExtractionJob(data: AiExtractionJobData): Promise<string> {
  const q = getAiExtractionQueue();
  if (!q) throw new Error('AI extraction queue not initialized — REDIS_URL not set');

  const job = await q.add('extract-ai', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { age: 7 * 24 * 3600 },
  });

  console.log(`Queued AI extraction job: ${job.id} (spool: ${data.spoolId})`);
  return job.id!;
}

export async function addToDlq(data: ExtractionJobData): Promise<void> {
  const q = getDlqQueue();
  if (!q) return;
  await q.add('failed-extraction', data, {
    removeOnComplete: false,
  });
  console.log(`Moved to DLQ: file ${data.fileId}`);
}

// --- Excel generation queue ---

export interface ExcelGenerationJobData {
  exportId: string;
  jobId: string;
  includeConfidence: boolean;
}

export type ExcelProcessorFn = (job: Job<ExcelGenerationJobData>) => Promise<void>;

function getExcelGenerationQueue(): Queue | null {
  if (!env.REDIS_URL) return null;
  if (!excelGenerationQueue) {
    if (!queueConnection) queueConnection = createConnection()!;
    excelGenerationQueue = new Queue(EXCEL_GENERATION_QUEUE, { connection: queueConnection });
  }
  return excelGenerationQueue;
}

export async function addExcelGenerationJob(data: ExcelGenerationJobData): Promise<string> {
  const q = getExcelGenerationQueue();
  if (!q) throw new Error('Excel generation queue not initialized — REDIS_URL not set');

  const job = await q.add('generate-excel', data, {
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 7 * 24 * 3600 },
    removeOnFail: { age: 30 * 24 * 3600 },
  });

  console.log(`Queued excel generation job: ${job.id} (export: ${data.exportId})`);
  return job.id!;
}

export function startExcelWorker(processor: ExcelProcessorFn): Worker | null {
  if (!env.REDIS_URL) return null;
  if (excelWorker) return excelWorker;

  excelWorkerConnection = createConnection()!;

  excelWorker = new Worker<ExcelGenerationJobData>(
    EXCEL_GENERATION_QUEUE,
    processor,
    {
      connection: excelWorkerConnection,
      concurrency: env.EXCEL_WORKER_CONCURRENCY,
      lockDuration: 300000, // 5 minutes
    }
  );

  excelWorker.on('completed', (job) => {
    console.log(`Excel generation completed: ${job.id} (export: ${job.data.exportId})`);
  });

  excelWorker.on('failed', (job, err) => {
    console.error(`Excel generation failed: ${job?.id} — ${err.message}`);
  });

  console.log(`BullMQ excel worker started: queue=${EXCEL_GENERATION_QUEUE}, concurrency=${env.EXCEL_WORKER_CONCURRENCY}`);
  return excelWorker;
}

export async function initQueue(): Promise<void> {
  if (!env.REDIS_URL) {
    console.log('REDIS_URL not set — job queue disabled');
    return;
  }

  getQueue();
  console.log(`BullMQ queue initialized: ${QUEUE_NAME}`);
}

export async function checkRedisConnection(): Promise<boolean> {
  try {
    const conn = queueConnection;
    if (!conn) return false;
    const result = await conn.ping();
    return result === 'PONG';
  } catch {
    return false;
  }
}

export async function shutdownQueue(): Promise<void> {
  if (worker) {
    console.log('Draining BullMQ worker...');
    await worker.close();
    worker = null;
  }
  if (excelWorker) {
    console.log('Draining BullMQ excel worker...');
    await excelWorker.close();
    excelWorker = null;
  }
  if (queue) {
    await queue.close();
    queue = null;
  }
  if (aiExtractionQueue) {
    await aiExtractionQueue.close();
    aiExtractionQueue = null;
  }
  if (dlqQueue) {
    await dlqQueue.close();
    dlqQueue = null;
  }
  if (excelGenerationQueue) {
    await excelGenerationQueue.close();
    excelGenerationQueue = null;
  }
  if (excelWorkerConnection) {
    await excelWorkerConnection.quit();
    excelWorkerConnection = null;
  }
  if (workerConnection) {
    await workerConnection.quit();
    workerConnection = null;
  }
  if (queueConnection) {
    await queueConnection.quit();
    queueConnection = null;
  }
}
