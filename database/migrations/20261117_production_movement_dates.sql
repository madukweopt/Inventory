-- Preserve the original production date; date physical issues/receipts separately.
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS movement_date date;
