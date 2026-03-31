-- 002_jsonb_schema.sql
-- Migrate Material, Spool Union, Cut, and Spool Metadata tables
-- from fixed typed columns to JSONB raw_data columns.
-- Drawing formats vary by client, so flexible schema is required.

-- Material: replace material_type, quantity, unit, specification with raw_data JSONB
ALTER TABLE material DROP COLUMN IF EXISTS material_type;
ALTER TABLE material DROP COLUMN IF EXISTS quantity;
ALTER TABLE material DROP COLUMN IF EXISTS unit;
ALTER TABLE material DROP COLUMN IF EXISTS specification;
ALTER TABLE material ADD COLUMN IF NOT EXISTS raw_data JSONB NOT NULL DEFAULT '{}';

-- Spool Union: replace union_type, size, quantity, specification with raw_data JSONB
ALTER TABLE spool_union DROP COLUMN IF EXISTS union_type;
ALTER TABLE spool_union DROP COLUMN IF EXISTS size;
ALTER TABLE spool_union DROP COLUMN IF EXISTS quantity;
ALTER TABLE spool_union DROP COLUMN IF EXISTS specification;
ALTER TABLE spool_union ADD COLUMN IF NOT EXISTS raw_data JSONB NOT NULL DEFAULT '{}';

-- Cut: replace cut_type, location, angle, quantity, specification with raw_data JSONB
ALTER TABLE cut DROP COLUMN IF EXISTS cut_type;
ALTER TABLE cut DROP COLUMN IF EXISTS location;
ALTER TABLE cut DROP COLUMN IF EXISTS angle;
ALTER TABLE cut DROP COLUMN IF EXISTS quantity;
ALTER TABLE cut DROP COLUMN IF EXISTS specification;
ALTER TABLE cut ADD COLUMN IF NOT EXISTS raw_data JSONB NOT NULL DEFAULT '{}';

-- Spool Metadata: replace all fixed fields with raw_data JSONB
ALTER TABLE spool_metadata DROP COLUMN IF EXISTS drawing_number;
ALTER TABLE spool_metadata DROP COLUMN IF EXISTS revision;
ALTER TABLE spool_metadata DROP COLUMN IF EXISTS date_created;
ALTER TABLE spool_metadata DROP COLUMN IF EXISTS material_grade;
ALTER TABLE spool_metadata DROP COLUMN IF EXISTS pressure_rating;
ALTER TABLE spool_metadata DROP COLUMN IF EXISTS temperature_rating;
ALTER TABLE spool_metadata DROP COLUMN IF EXISTS total_weight;
ALTER TABLE spool_metadata DROP COLUMN IF EXISTS weight_unit;
ALTER TABLE spool_metadata DROP COLUMN IF EXISTS notes;
ALTER TABLE spool_metadata ADD COLUMN IF NOT EXISTS raw_data JSONB NOT NULL DEFAULT '{}';

-- GIN indexes for JSONB queries
CREATE INDEX IF NOT EXISTS idx_material_raw_data ON material USING GIN (raw_data);
CREATE INDEX IF NOT EXISTS idx_union_raw_data ON spool_union USING GIN (raw_data);
CREATE INDEX IF NOT EXISTS idx_cut_raw_data ON cut USING GIN (raw_data);
CREATE INDEX IF NOT EXISTS idx_metadata_raw_data ON spool_metadata USING GIN (raw_data);
