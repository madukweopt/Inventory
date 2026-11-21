-- One-time keys sent with a payment, a manual stock change or an expense, so a double tap or a retry
-- after a lost connection saves the entry only once. Older rows have none (NULL).
ALTER TABLE sale_payments ADD COLUMN IF NOT EXISTS submission_key uuid;
ALTER TABLE stock_counts ADD COLUMN IF NOT EXISTS submission_key uuid;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS submission_key uuid;
CREATE UNIQUE INDEX IF NOT EXISTS sale_payments_submission_key ON sale_payments(submission_key) WHERE submission_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS stock_counts_submission_key ON stock_counts(submission_key) WHERE submission_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS expenses_submission_key ON expenses(submission_key) WHERE submission_key IS NOT NULL;
