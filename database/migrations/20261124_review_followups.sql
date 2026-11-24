-- Why goods moved before their authorisation date, entered when a correction dates them earlier.
ALTER TABLE weighing_requests ADD COLUMN early_movement_reason text;
-- A reversed running payment keeps its expense and points to the matching reversal entry.
ALTER TABLE partner_payments ADD COLUMN reversal_expense_id integer UNIQUE REFERENCES expenses(expense_id) ON DELETE RESTRICT;
-- Kernel returned to store names the production day it came back from; that day's kernel processed is net of it.
ALTER TABLE stock_counts ADD COLUMN return_request_id integer REFERENCES weighing_requests(request_id) ON DELETE RESTRICT;
ALTER TABLE production ADD COLUMN kernel_returned numeric NOT NULL DEFAULT 0;
