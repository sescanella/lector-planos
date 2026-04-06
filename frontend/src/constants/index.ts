export const API_URL = (import.meta.env.VITE_API_URL as string) || 'http://localhost:3000';

export const AUTH_STORAGE_KEY = 'blueprintai_api_key';
export const INTENDED_PATH_KEY = 'blueprintai_intended_path';

export const POLLING_INTERVALS = {
  JOBS_PROCESSING: 5000,
  JOB_DETAIL_PROCESSING: 3000,
  EXPORT_IN_FLIGHT: 3000,
} as const;

export const STALE_TIMES = {
  SPOOL: 5 * 60 * 1000,
  JOB: 30 * 1000,
  EXPORT_IN_FLIGHT: 3 * 1000,
  EXPORT_COMPLETED: 30 * 1000,
} as const;

export const UPLOAD = {
  MAX_FILES: 200,
  MAX_FILE_SIZE_BYTES: 50 * 1024 * 1024,
  MAX_PARALLEL: 5,
  MAX_RETRIES: 3,
  ACCEPTED_TYPES: ['application/pdf'],
  ACCEPTED_EXTENSIONS: ['.pdf'],
} as const;

export const PAGE_SIZE = 20;
