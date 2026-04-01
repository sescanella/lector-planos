import dotenv from 'dotenv';

dotenv.config();

const port = parseInt(process.env.PORT || '3000', 10);
if (isNaN(port) || port < 1 || port > 65535) {
  throw new Error(`Invalid PORT: ${process.env.PORT}`);
}

const dbPoolMax = parseInt(process.env.DB_POOL_MAX || '20', 10);

export const env = {
  PORT: port,
  DATABASE_URL: process.env.DATABASE_URL || '',
  NODE_ENV: process.env.NODE_ENV || 'development',
  DB_POOL_MAX: dbPoolMax,
  // AWS S3
  AWS_REGION: process.env.AWS_REGION || 'us-east-1',
  S3_BUCKET_NAME: process.env.S3_BUCKET_NAME || '',
  // Redis
  REDIS_URL: process.env.REDIS_URL || '',
  // Authentication
  API_KEY: process.env.API_KEY || '',
  // CORS
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  // PDF Processing
  PDF_DPI: parseInt(process.env.PDF_DPI || '200', 10),
  PDF_TIMEOUT_MS: parseInt(process.env.PDF_TIMEOUT_MS || '30000', 10),
  // Worker
  WORKER_CONCURRENCY: parseInt(process.env.WORKER_CONCURRENCY || '5', 10),
};

// Validate bounds on critical env vars
if (env.PDF_DPI < 72 || env.PDF_DPI > 600) {
  throw new Error(`Invalid PDF_DPI: ${env.PDF_DPI} (must be 72-600)`);
}
if (env.PDF_TIMEOUT_MS < 5000 || env.PDF_TIMEOUT_MS > 300000) {
  throw new Error(`Invalid PDF_TIMEOUT_MS: ${env.PDF_TIMEOUT_MS} (must be 5000-300000)`);
}
if (env.WORKER_CONCURRENCY < 1 || env.WORKER_CONCURRENCY > 20) {
  throw new Error(`Invalid WORKER_CONCURRENCY: ${env.WORKER_CONCURRENCY} (must be 1-20)`);
}
if (env.DB_POOL_MAX < 1 || env.DB_POOL_MAX > 100) {
  throw new Error(`Invalid DB_POOL_MAX: ${env.DB_POOL_MAX} (must be 1-100)`);
}

// Fail fast in production if S3 is not configured
if (env.NODE_ENV === 'production' && !env.S3_BUCKET_NAME) {
  throw new Error('S3_BUCKET_NAME is required in production');
}
