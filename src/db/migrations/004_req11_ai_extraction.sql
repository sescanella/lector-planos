-- 004_req11_ai_extraction.sql
-- Add AI vision extraction columns to spool and extraction_job tables

-- spool: vision processing status with 6-state lifecycle
ALTER TABLE spool
  ADD COLUMN IF NOT EXISTS vision_status VARCHAR(20) NOT NULL DEFAULT 'pending'
  CHECK (vision_status IN ('pending', 'processing', 'completed', 'completed_partial', 'failed', 'skipped'));

-- spool: timestamp when vision processing began
ALTER TABLE spool
  ADD COLUMN IF NOT EXISTS vision_processing_started_at TIMESTAMPTZ;

-- spool: raw AI extraction output
ALTER TABLE spool
  ADD COLUMN IF NOT EXISTS extraction_data JSONB NOT NULL DEFAULT '{}';

-- spool: drawing format metadata (paperSize, orientation, familyHint required keys)
-- Uses jsonb_exists() instead of ? operator to avoid node-postgres placeholder conflicts
ALTER TABLE spool
  ADD COLUMN IF NOT EXISTS drawing_format JSONB
  CHECK (
    drawing_format IS NULL
    OR (
      jsonb_exists(drawing_format, 'paperSize')
      AND jsonb_exists(drawing_format, 'orientation')
      AND jsonb_exists(drawing_format, 'familyHint')
    )
  );

-- extraction_job: cumulative AI API cost tracking
ALTER TABLE extraction_job
  ADD COLUMN IF NOT EXISTS vision_cost_usd NUMERIC(10,4) NOT NULL DEFAULT 0
  CHECK (vision_cost_usd >= 0);

-- Index: fast lookup for pending/failed spools awaiting vision processing
CREATE INDEX IF NOT EXISTS idx_spool_vision_status
  ON spool(vision_status) WHERE vision_status IN ('pending', 'failed');

-- Index: detect stale processing spools (timeout recovery)
CREATE INDEX IF NOT EXISTS idx_spool_vision_processing
  ON spool(vision_status, vision_processing_started_at) WHERE vision_status = 'processing';
