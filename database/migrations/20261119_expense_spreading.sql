-- A payment for a long period (rent, insurance) is counted evenly over its months, starting with the payment month.
-- The first start-up months are labelled as start-up costs (before production). Existing expenses stay one month, no start-up.
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS spread_months integer NOT NULL DEFAULT 1;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS startup_months integer NOT NULL DEFAULT 0;
DO $$ BEGIN
    IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='expenses'::regclass AND conname='expenses_spreading_check') THEN
        ALTER TABLE expenses ADD CONSTRAINT expenses_spreading_check CHECK(spread_months BETWEEN 1 AND 60 AND startup_months BETWEEN 0 AND spread_months);
    END IF;
END $$;
