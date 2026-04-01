-- 005: Add unique constraint on spool(file_id, page_number) to prevent duplicate spools on retry
-- Also deduplicate any existing duplicates before adding the constraint

-- Remove duplicates keeping the most recent one (by spool_id)
DELETE FROM spool s1
USING spool s2
WHERE s1.file_id = s2.file_id
  AND s1.page_number = s2.page_number
  AND s1.spool_id < s2.spool_id;

-- Add unique constraint
ALTER TABLE spool ADD CONSTRAINT uq_spool_file_page UNIQUE (file_id, page_number);
