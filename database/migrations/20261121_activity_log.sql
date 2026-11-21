-- Activity Log: one row for every successful save, edit or delete made through the app, and every sign-in.
-- user_id is the person who really did it (the Director, even while using another account through Switch
-- Account); acting_user_id is the account that was in use. Names are copied so the entry still reads correctly
-- if an account is later renamed or deleted. No request contents (and never a password) are stored.
CREATE TABLE IF NOT EXISTS activity_log (
    log_id bigserial PRIMARY KEY,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    user_id integer REFERENCES users(user_id) ON DELETE SET NULL,
    acting_user_id integer REFERENCES users(user_id) ON DELETE SET NULL,
    username text,
    acting_username text,
    action text NOT NULL,
    record_type text NOT NULL,
    record_id text,
    method varchar(10) NOT NULL,
    path text NOT NULL
);
CREATE INDEX IF NOT EXISTS activity_log_occurred ON activity_log (occurred_at DESC,log_id DESC);
CREATE INDEX IF NOT EXISTS activity_log_user ON activity_log (user_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS activity_log_type ON activity_log (record_type,occurred_at DESC);
