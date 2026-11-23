ALTER TABLE users ADD COLUMN enabled boolean NOT NULL DEFAULT true,
    ADD COLUMN session_version integer NOT NULL DEFAULT 0;

-- Apply revocation to every account editor, including the terminal password reset.
CREATE FUNCTION revoke_changed_login() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF (NEW.password_hash,NEW.enabled,NEW.role) IS DISTINCT FROM (OLD.password_hash,OLD.enabled,OLD.role) THEN
        NEW.session_version := OLD.session_version + 1;
        -- The session table is created by the server on first start, so it may not exist yet.
        IF to_regclass('session') IS NOT NULL THEN
            EXECUTE 'DELETE FROM session WHERE sess->>''user_id''=$1 OR sess->>''admin_user_id''=$1' USING OLD.user_id::text;
        END IF;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER revoke_changed_login BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION revoke_changed_login();

ALTER TABLE weighing_requests ADD COLUMN agreed_due_date date;
ALTER TABLE service_partners ADD COLUMN archived_at timestamptz;
ALTER TABLE partner_payments ADD COLUMN submission_key uuid UNIQUE,
    ADD COLUMN reversed_at timestamptz, ADD COLUMN reversed_by integer REFERENCES users(user_id),
    ADD COLUMN reversal_reason text;

CREATE FUNCTION invoice_amount(quantity numeric, unit_price numeric) RETURNS numeric
    LANGUAGE sql IMMUTABLE STRICT AS $$ SELECT round(quantity * unit_price, 2) $$;

-- Each saved weighing has its own date and timestamp. Keep any older unmatched
-- balance on the original inventory row, including discrepancies awaiting review.
CREATE VIEW timed_stock_movements AS
WITH batches AS (
    SELECT s.count_id,b.batch_id,b.created_at::timestamp AS created_at,
        CASE split_part(s.source_part,'@',1)
          WHEN 'PKO Received' THEN b.pko_produced WHEN 'PKC Received' THEN b.pkc_produced
          WHEN 'Sludge Received' THEN b.sludge_produced ELSE 0 END AS received,
        CASE split_part(s.source_part,'@',1) WHEN 'Kernel Issued' THEN b.kernel_used ELSE 0 END AS issued
    FROM stock_counts s JOIN weighing_requests w ON w.request_id=s.source_id
    JOIN production_batches b ON b.request_id=w.request_id AND NOT b.voided AND NOT b.legacy_batch
        AND COALESCE(b.movement_date,w.request_date)=s.count_date
    WHERE s.source_type='Production'
), totals AS (
    SELECT count_id,sum(received) received,sum(issued) issued FROM batches GROUP BY count_id
)
SELECT s.count_id,0 AS batch_id,s.item_id,s.count_date,s.created_at,s.source_type,s.source_id,s.adjustment_reason,
    s.received-COALESCE(t.received,0) AS received,s.issued-COALESCE(t.issued,0) AS issued
FROM stock_counts s LEFT JOIN totals t USING(count_id)
WHERE t.count_id IS NULL OR s.received<>t.received OR s.issued<>t.issued
UNION ALL
SELECT s.count_id,b.batch_id,s.item_id,s.count_date,b.created_at,s.source_type,s.source_id,s.adjustment_reason,b.received,b.issued
FROM batches b JOIN stock_counts s USING(count_id) WHERE b.received<>0 OR b.issued<>0;
