-- 003_req10_page_extraction.sql
-- Extend pdf_file and spool tables for page extraction pipeline

ALTER TABLE pdf_file
  ADD COLUMN IF NOT EXISTS failed_pages INTEGER NOT NULL DEFAULT 0
  CHECK (failed_pages >= 0);

ALTER TABLE spool
  ADD COLUMN IF NOT EXISTS image_s3_key VARCHAR(1024);

ALTER TABLE spool
  ADD COLUMN IF NOT EXISTS image_format VARCHAR(10)
  CHECK (image_format IN ('png', 'jpeg'));

ALTER TABLE spool ALTER COLUMN spool_number DROP NOT NULL;

ALTER TABLE spool
  ADD COLUMN IF NOT EXISTS extraction_status VARCHAR(20) NOT NULL DEFAULT 'pending'
  CHECK (extraction_status IN ('pending', 'extracted', 'failed'));

CREATE INDEX IF NOT EXISTS idx_spool_extraction_status
  ON spool(file_id, extraction_status);

ALTER TABLE spool
  ADD COLUMN IF NOT EXISTS ai_enqueue_status VARCHAR(20) NOT NULL DEFAULT 'pending'
  CHECK (ai_enqueue_status IN ('pending', 'queued', 'failed'));

CREATE INDEX IF NOT EXISTS idx_spool_ai_enqueue_failed
  ON spool(ai_enqueue_status) WHERE ai_enqueue_status = 'failed';
