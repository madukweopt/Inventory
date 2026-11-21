-- A no-use confirmation is not a stock movement.
CREATE TABLE IF NOT EXISTS daily_consumable_checks (
    check_date date NOT NULL,
    item_id integer NOT NULL REFERENCES items(item_id) ON DELETE CASCADE,
    recorded_by integer REFERENCES users(user_id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (check_date,item_id)
);
