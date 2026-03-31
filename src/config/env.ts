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
};
