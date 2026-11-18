-- Director-chosen reason for a manual stock change; older rows stay unlabelled and report as Other.
ALTER TABLE stock_counts ADD COLUMN IF NOT EXISTS adjustment_reason text;
DO $$ BEGIN
    IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='stock_counts'::regclass AND conname='stock_counts_adjustment_reason_check') THEN
        ALTER TABLE stock_counts ADD CONSTRAINT stock_counts_adjustment_reason_check
            CHECK(adjustment_reason IS NULL OR adjustment_reason IN ('Spill','Disposal','Count difference','Return to store','Other'));
    END IF;
END $$;
-- A reversed payment keeps its receipt for the record but no longer counts as paid.
ALTER TABLE sale_payments ADD COLUMN IF NOT EXISTS reversed_at timestamptz;
ALTER TABLE sale_payments ADD COLUMN IF NOT EXISTS reversed_by integer REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE sale_payments ADD COLUMN IF NOT EXISTS reversal_reason text;
