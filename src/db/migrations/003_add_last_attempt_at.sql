-- Add retry columns for manual retry support. These were added to 001_init.sql
-- but the table already existed from a prior deployment, so CREATE TABLE IF NOT
-- EXISTS skipped them.

ALTER TABLE builds ADD COLUMN IF NOT EXISTS retries INT NOT NULL DEFAULT 0;
ALTER TABLE builds ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;
