# Inventory
An inventory app for a small oil extraction business

Production is authorised once per day. The store keeper saves separate weighed batches (including individual product weighings), which immediately update stock and one daily production record. Finish Day closes the authorisation. Saved batches retain the operator, time and scale ticket; an authorisation with saved quantities cannot be cancelled.

For existing databases, apply `database/migrations/20261114_production_batches.sql` before deploying this version. New databases use `database/schema.sql`.

Managers can cancel only their own unused authorisations; Admin can cancel any unused authorisation. Only Admin can reopen finished production, using Reopen Production in Pending Weighing. Reopening keeps the same daily record and saved stock movements.

Authorisation labels are numbered separately for each type and date (Sale 1, Purchase 1, Production 1). Completed and cancelled authorisations retain their place in the daily sequence, so remaining pending labels do not change.

Dependency corrections and audit findings are documented in `docs/dependency-audit.md`. Run the read-only database audit with `node scripts/audit-dependencies.js`. Generated inventory is corrected through its source business record; paid sales and ambiguous legacy corrections are protected against destructive changes.

The 15 November dependency fixes use `database/migrations/20261115_dependency_fixes.sql` for existing databases (already applied to the configured database). Admin batch corrections and legacy-stock matching are available in Pending Weighing. Payroll preparation recalculates unpaid records and preserves paid amounts; invoices retain saved identities. Costing follows batch/dispatch order and carries unallocated product costs to the next receipt. Purchased-finished-goods costing and general who/why history are intentionally deferred. Customer payments can now be reversed by Admin with a reason; the receipt is kept and marked reversed. See the current-status notes in `docs/dependency-audit.md`.

Continuous production now records kernel issues and product receipts independently. Unfinished-material quantity/value carries forward internally for costing only; no unfinished-stock panel or new loss-entry controls are shown. See `docs/continuous-production.md`; this replaces the earlier next-batch cost allocation. The new additive migration is `database/migrations/20261115_continuous_production.sql`.

The test dataset can be rebuilt with `npm run seed -- --reset --confirm-database <database name>` for 1 June–17 November 2026. The command verifies a recovery backup first, preserves login accounts, clears sessions, and creates linked authorisations, individual weighings, movements, invoices, receipts and payroll. See `docs/test-data.md`. Running `npm run seed` without `--reset` changes nothing.

The 18 November business fixes use `database/migrations/20261118_business_fixes.sql` (already applied to the configured database). Confirm Receipt and Confirm Dispatch save the date goods actually arrived or left. Finish Day records kernel not recovered as weighed product as production loss. Product costs are shared per production authorisation. Manual stock changes carry a reason, and the dashboard shows delivery shortfall and stock losses separately from cost of products sold.

The driver signs on the device before Confirm Dispatch; the server refuses a dispatch without a valid driver name and signature, and saves the signed delivery note with the dispatch. The Director can still correct a signed sale with a reason, recorded in `sale_corrections` (`database/migrations/20261118_sale_corrections.sql`, already applied) and shown on the delivery note. A signed sale cannot be deleted.

Other Partners records fabricators, installers, equipment dealers and repairers, their jobs with agreed prices, and Director-only payments against each job. Assets and Start-up Costs is the asset register. It also lists start-up costs (the start-up share of expenses) and shows the total invested. Fabrication, installation and equipment-purchase jobs become assets, and payments on repair, service or other running jobs each create one running expense. Expenses now hold running costs only. The migration `database/migrations/20261118_partners_assets.sql` (already applied) adds the tables and moves earlier Asset/Capital Expenditure expenses into Capital Assets.

Start-up costs are entered on Assets and Start-up Costs (+ Add Start-up Cost) and saved as expenses spread over 1–60 months from the payment month; the Expenses form has no months fields, and editing there keeps the saved months. The dashboard counts an equal share each month, shared across its days, and reports the first start-up months separately as start-up costs. The migration is `database/migrations/20261119_expense_spreading.sql` (already applied). Existing expenses stay one month with no start-up.

Manual stock changes keep a history trail in `stock_change_history` (`database/migrations/20261120_stock_change_history.sql`, already applied). Each create, edit and delete of an Inventory Report entry, and each edit or delete of a Daily Usage entry, adds a row with the values before and after, who made it and when; the app never changes these rows. Existing Inventory Report entries were given one backfilled Created row from their saved values. The Director sees the trail in Data → Stock Change History.
