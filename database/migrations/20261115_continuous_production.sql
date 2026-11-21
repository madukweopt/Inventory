ALTER TABLE production ADD COLUMN IF NOT EXISTS process_loss numeric(14,2) NOT NULL DEFAULT 0 CHECK(process_loss>=0);
