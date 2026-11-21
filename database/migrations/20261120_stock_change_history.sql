-- History trail of manual stock changes (Inventory Report and Daily Usage corrections).
-- One row per create, edit or delete, with the values before and after, who did it and when.
-- Rows are only ever added; the app never edits or deletes them.
CREATE TABLE IF NOT EXISTS stock_change_history (
    history_id serial PRIMARY KEY,
    count_id integer NOT NULL,
    action varchar(10) NOT NULL CHECK (action IN ('Created','Edited','Deleted')),
    before_values jsonb,
    after_values jsonb,
    changed_by integer REFERENCES users(user_id),
    changed_at timestamp without time zone NOT NULL DEFAULT now(),
    backfilled boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS stock_change_history_changed_at ON stock_change_history (changed_at DESC,history_id DESC);
CREATE INDEX IF NOT EXISTS stock_change_history_count_id ON stock_change_history (count_id);

-- Inventory Report entries made before the history existed get one Created row from what is saved now.
-- Their earlier edits were not recorded, so backfilled rows are marked.
INSERT INTO stock_change_history (count_id,action,after_values,changed_by,changed_at,backfilled)
SELECT s.count_id,'Created',
    jsonb_build_object('count_date',to_char(s.count_date,'YYYY-MM-DD'),'item_id',s.item_id,'received',s.received,'issued',s.issued,'adjustment_reason',s.adjustment_reason),
    s.recorded_by,COALESCE(s.created_at,now()),true
FROM stock_counts s
WHERE s.source_type='Manual' AND s.source_id IS NULL AND (s.source_part IS NULL OR s.source_part NOT LIKE 'Use:%')
AND NOT EXISTS (SELECT 1 FROM stock_change_history h WHERE h.count_id=s.count_id);
