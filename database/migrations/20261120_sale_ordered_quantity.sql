-- The quantity ordered, entered when a sale or purchase is authorised, so the Storekeeper knows how much to load or expect.
-- Older authorisations have none (NULL) until the Director or the authorising Manager adds it on the pending card.
ALTER TABLE weighing_requests ADD COLUMN IF NOT EXISTS ordered_quantity numeric(14,2);
DO $$ BEGIN
    IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='weighing_requests'::regclass AND conname='weighing_requests_ordered_quantity_check') THEN
        ALTER TABLE weighing_requests ADD CONSTRAINT weighing_requests_ordered_quantity_check CHECK(ordered_quantity IS NULL OR ordered_quantity>0);
    END IF;
END $$;
