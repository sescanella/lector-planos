-- 006: Add optional name column to extraction_job for user-friendly OT naming
ALTER TABLE extraction_job ADD COLUMN IF NOT EXISTS name VARCHAR(255);
