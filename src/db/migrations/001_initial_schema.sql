-- 001_initial_schema.sql
-- Creates all tables for BlueprintAI extraction pipeline

-- Extraction Job: batch upload and processing session
CREATE TABLE IF NOT EXISTS extraction_job (
  job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  webhook_url TEXT,
  error_message TEXT,
  file_count INTEGER NOT NULL DEFAULT 0,
  processed_count INTEGER NOT NULL DEFAULT 0
);

-- PDF File: uploaded PDF and its processing state
CREATE TABLE IF NOT EXISTS pdf_file (
  file_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES extraction_job(job_id) ON DELETE CASCADE,
  original_filename VARCHAR(512) NOT NULL,
  s3_key VARCHAR(1024) NOT NULL,
  file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes >= 0),
  page_count INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'processing', 'completed', 'failed')),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processing_started_at TIMESTAMPTZ,
  processing_completed_at TIMESTAMPTZ,
  error_message TEXT
);

-- Spool: single spool extracted from a PDF page
CREATE TABLE IF NOT EXISTS spool (
  spool_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES pdf_file(file_id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL CHECK (page_number > 0),
  spool_number VARCHAR(255) NOT NULL,
  confidence_score REAL NOT NULL DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Material: material component in a spool
CREATE TABLE IF NOT EXISTS material (
  material_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spool_id UUID NOT NULL REFERENCES spool(spool_id) ON DELETE CASCADE,
  material_type VARCHAR(255) NOT NULL,
  quantity DECIMAL NOT NULL CHECK (quantity >= 0),
  unit VARCHAR(50) NOT NULL,
  specification VARCHAR(512),
  confidence_score REAL NOT NULL DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Spool Union (weld/joint): joint or connection in a spool
-- Named spool_union to avoid SQL reserved word "union"
CREATE TABLE IF NOT EXISTS spool_union (
  union_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spool_id UUID NOT NULL REFERENCES spool(spool_id) ON DELETE CASCADE,
  union_type VARCHAR(255) NOT NULL,
  size VARCHAR(100),
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  specification VARCHAR(512),
  confidence_score REAL NOT NULL DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cut: cut or section in a spool
CREATE TABLE IF NOT EXISTS cut (
  cut_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spool_id UUID NOT NULL REFERENCES spool(spool_id) ON DELETE CASCADE,
  cut_type VARCHAR(255) NOT NULL,
  location VARCHAR(255),
  angle DECIMAL,
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  specification VARCHAR(512),
  confidence_score REAL NOT NULL DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Spool Metadata: extracted metadata about a spool
CREATE TABLE IF NOT EXISTS spool_metadata (
  metadata_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spool_id UUID NOT NULL UNIQUE REFERENCES spool(spool_id) ON DELETE CASCADE,
  drawing_number VARCHAR(255),
  revision VARCHAR(50),
  date_created DATE,
  material_grade VARCHAR(255),
  pressure_rating VARCHAR(100),
  temperature_rating VARCHAR(100),
  total_weight DECIMAL,
  weight_unit VARCHAR(20),
  notes TEXT,
  confidence_score REAL NOT NULL DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Correction: user feedback and corrections to extracted data
CREATE TABLE IF NOT EXISTS correction (
  correction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spool_id UUID NOT NULL REFERENCES spool(spool_id) ON DELETE CASCADE,
  field_type VARCHAR(20) NOT NULL CHECK (field_type IN ('material', 'union', 'cut', 'metadata')),
  field_id UUID,
  original_value TEXT NOT NULL,
  corrected_value TEXT NOT NULL,
  correction_type VARCHAR(10) NOT NULL CHECK (correction_type IN ('add', 'modify', 'delete')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(255)
);

-- Indexes per REQ-2 specification
CREATE INDEX IF NOT EXISTS idx_extraction_job_status_created ON extraction_job(status, created_at);
CREATE INDEX IF NOT EXISTS idx_pdf_file_job_status ON pdf_file(job_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pdf_file_s3_key ON pdf_file(s3_key);
CREATE INDEX IF NOT EXISTS idx_spool_file_number ON spool(file_id, spool_number);
CREATE INDEX IF NOT EXISTS idx_material_spool ON material(spool_id);
CREATE INDEX IF NOT EXISTS idx_union_spool ON spool_union(spool_id);
CREATE INDEX IF NOT EXISTS idx_cut_spool ON cut(spool_id);
CREATE INDEX IF NOT EXISTS idx_correction_spool_created ON correction(spool_id, created_at);
CREATE INDEX IF NOT EXISTS idx_correction_field ON correction(field_type, field_id);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON spool
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON material
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON spool_union
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON cut
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON spool_metadata
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
