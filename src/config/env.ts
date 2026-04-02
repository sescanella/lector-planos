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
  // Excel Export (REQ-12)
  EXCEL_WORKER_CONCURRENCY: parseInt(process.env.EXCEL_WORKER_CONCURRENCY || '2', 10),
  EXCEL_EXPORT_EXPIRY_DAYS: parseInt(process.env.EXCEL_EXPORT_EXPIRY_DAYS || '7', 10),
  // Webhook
  WEBHOOK_HMAC_SECRET: process.env.WEBHOOK_HMAC_SECRET || '',
  // Presigned URL
  EXPORT_PRESIGNED_EXPIRY_SECS: parseInt(process.env.EXPORT_PRESIGNED_EXPIRY_SECS || '14400', 10),
  // AI Vision Extraction (REQ-11)
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  VISION_MODEL: process.env.VISION_MODEL || 'claude-sonnet-4-20250514',
  VISION_MAX_TOKENS: parseInt(process.env.VISION_MAX_TOKENS || '8192', 10),
  VISION_TIMEOUT_MS: parseInt(process.env.VISION_TIMEOUT_MS || '30000', 10),
  CROP_DPI: parseInt(process.env.CROP_DPI || '600', 10),
  CAJETIN_DPI: parseInt(process.env.CAJETIN_DPI || '800', 10),
  AI_WORKER_CONCURRENCY: parseInt(process.env.AI_WORKER_CONCURRENCY || '3', 10),
  VISION_MAX_COST_PER_JOB_USD: parseFloat(process.env.VISION_MAX_COST_PER_JOB_USD || '20'),
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

// Excel export validation (REQ-12)
if (env.EXCEL_WORKER_CONCURRENCY < 1 || env.EXCEL_WORKER_CONCURRENCY > 5) {
  throw new Error(`Invalid EXCEL_WORKER_CONCURRENCY: ${env.EXCEL_WORKER_CONCURRENCY} (must be 1-5)`);
}
if (env.EXCEL_EXPORT_EXPIRY_DAYS < 1 || env.EXCEL_EXPORT_EXPIRY_DAYS > 30) {
  throw new Error(`Invalid EXCEL_EXPORT_EXPIRY_DAYS: ${env.EXCEL_EXPORT_EXPIRY_DAYS} (must be 1-30)`);
}
if (env.WEBHOOK_HMAC_SECRET && env.WEBHOOK_HMAC_SECRET.length < 32) {
  throw new Error('WEBHOOK_HMAC_SECRET must be at least 32 characters if set');
}
if (env.EXPORT_PRESIGNED_EXPIRY_SECS < 300 || env.EXPORT_PRESIGNED_EXPIRY_SECS > 86400) {
  throw new Error(`Invalid EXPORT_PRESIGNED_EXPIRY_SECS: ${env.EXPORT_PRESIGNED_EXPIRY_SECS} (must be 300-86400)`);
}

// AI Vision extraction validation (REQ-11)
// Fail-fast in all non-test environments; tests may not need a real key
if (!env.ANTHROPIC_API_KEY && env.NODE_ENV !== 'test') {
  throw new Error('ANTHROPIC_API_KEY is required');
}
if (env.VISION_MAX_TOKENS < 1024 || env.VISION_MAX_TOKENS > 16384) {
  throw new Error(`Invalid VISION_MAX_TOKENS: ${env.VISION_MAX_TOKENS} (must be 1024-16384)`);
}
if (env.VISION_TIMEOUT_MS < 5000 || env.VISION_TIMEOUT_MS > 120000) {
  throw new Error(`Invalid VISION_TIMEOUT_MS: ${env.VISION_TIMEOUT_MS} (must be 5000-120000)`);
}
if (env.CROP_DPI < 200 || env.CROP_DPI > 1200) {
  throw new Error(`Invalid CROP_DPI: ${env.CROP_DPI} (must be 200-1200)`);
}
if (env.CROP_DPI <= env.PDF_DPI) {
  throw new Error(`Invalid CROP_DPI: ${env.CROP_DPI} (must be greater than PDF_DPI=${env.PDF_DPI})`);
}
if (env.CAJETIN_DPI < 200 || env.CAJETIN_DPI > 1200) {
  throw new Error(`Invalid CAJETIN_DPI: ${env.CAJETIN_DPI} (must be 200-1200)`);
}
if (env.CAJETIN_DPI <= env.PDF_DPI) {
  throw new Error(`Invalid CAJETIN_DPI: ${env.CAJETIN_DPI} (must be greater than PDF_DPI=${env.PDF_DPI})`);
}
if (env.AI_WORKER_CONCURRENCY < 1 || env.AI_WORKER_CONCURRENCY > 10) {
  throw new Error(`Invalid AI_WORKER_CONCURRENCY: ${env.AI_WORKER_CONCURRENCY} (must be 1-10)`);
}
if (env.VISION_MAX_COST_PER_JOB_USD <= 0) {
  throw new Error(`Invalid VISION_MAX_COST_PER_JOB_USD: ${env.VISION_MAX_COST_PER_JOB_USD} (must be > 0)`);
}

if (env.CORS_ORIGIN === '*' && env.NODE_ENV === 'production') {
  throw new Error('CORS_ORIGIN must not be wildcard (*) in production. Set CORS_ORIGIN to your frontend domain.');
}

// Fail fast in production if critical config is missing
if (env.NODE_ENV === 'production' && !env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required in production');
}
if (env.NODE_ENV === 'production' && !env.REDIS_URL) {
  throw new Error('REDIS_URL is required in production');
}
if (env.NODE_ENV === 'production' && !env.S3_BUCKET_NAME) {
  throw new Error('S3_BUCKET_NAME is required in production');
}
if (env.NODE_ENV === 'production' && (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY)) {
  throw new Error('AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required in production');
}
if (env.NODE_ENV === 'production' && !env.API_KEY) {
  throw new Error('API_KEY is required in production');
}
if (env.NODE_ENV === 'production' && env.API_KEY && env.API_KEY.length < 32) {
  throw new Error('API_KEY must be at least 32 characters in production');
}
