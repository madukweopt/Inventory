ALTER TABLE weighing_requests ADD COLUMN IF NOT EXISTS billing_basis text NOT NULL DEFAULT 'Factory' CHECK(billing_basis IN ('Factory','Customer'));
ALTER TABLE weighing_requests ADD COLUMN IF NOT EXISTS representative_id integer REFERENCES users(user_id);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS billing_basis text NOT NULL DEFAULT 'Factory' CHECK(billing_basis IN ('Factory','Customer'));
ALTER TABLE sales ADD COLUMN IF NOT EXISTS factory_quantity numeric;
ALTER TABLE sales ALTER COLUMN invoice_number DROP NOT NULL;
CREATE TABLE IF NOT EXISTS delivery_notes (
    sales_id integer PRIMARY KEY REFERENCES sales(sales_id) ON DELETE CASCADE,
    representative_id integer REFERENCES users(user_id) ON DELETE SET NULL,
    driver_name text,
    driver_signature text,
    driver_signed_at timestamptz,
    driver_recorded_by integer REFERENCES users(user_id) ON DELETE SET NULL,
    buyer_name text,
    buyer_weight numeric CHECK(buyer_weight>0),
    buyer_signature text,
    evidence bytea,
    evidence_type text,
    evidence_name text,
    confirmed_by integer REFERENCES users(user_id) ON DELETE SET NULL,
    confirmed_at timestamptz,
    approved_by integer REFERENCES users(user_id) ON DELETE SET NULL,
    approved_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
