-- 004_excel_export.sql
-- Add excel_export table for tracking Excel generation jobs

CREATE TABLE IF NOT EXISTS excel_export (
  export_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES extraction_job(job_id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  s3_key VARCHAR(1024),
  file_size_bytes BIGINT,
  spool_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  include_confidence BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_excel_export_job ON excel_export(job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_excel_export_status ON excel_export(status);
CREATE INDEX IF NOT EXISTS idx_excel_export_expires ON excel_export(expires_at)
  WHERE status = 'completed';

CREATE UNIQUE INDEX IF NOT EXISTS idx_excel_export_inflight
  ON excel_export(job_id) WHERE status IN ('pending', 'processing');
