# Inventory
An inventory app for a small oil extraction business

Production is authorised once per day. The store keeper saves separate weighed batches (including individual product weighings), which immediately update stock and one daily production record. Finish Day closes the authorisation. Saved batches retain the operator, time and scale ticket; an authorisation with saved quantities cannot be cancelled.

For existing databases, apply `database/migrations/20261114_production_batches.sql` before deploying this version. New databases use `database/schema.sql`.

Managers can cancel only their own unused authorisations; Admin can cancel any unused authorisation. Only Admin can reopen finished production, using Reopen Production in Pending Weighing. Reopening keeps the same daily record and saved stock movements.

Authorisation labels are numbered separately for each type and date (Sale 1, Purchase 1, Production 1). Completed and cancelled authorisations retain their place in the daily sequence, so remaining pending labels do not change.

Dependency corrections and audit findings are documented in `docs/dependency-audit.md`. Run the read-only database audit with `node scripts/audit-dependencies.js`. Generated inventory is corrected through its source business record; paid sales and ambiguous legacy corrections are protected against destructive changes.

The 15 November dependency fixes use `database/migrations/20261115_dependency_fixes.sql` for existing databases (already applied to the configured database). Admin batch corrections and legacy-stock matching are available in Pending Weighing. Payroll preparation recalculates unpaid records and preserves paid amounts; invoices retain saved identities. Costing follows batch/dispatch order and carries unallocated product costs to the next receipt. Purchased-finished-goods costing, general who/why history and customer payment reversal are intentionally deferred. See the current-status notes in `docs/dependency-audit.md`.

Continuous production now records kernel issues and product receipts independently. Unfinished-material quantity/value carries forward internally for costing only; no unfinished-stock panel or new loss-entry controls are shown. See `docs/continuous-production.md`; this replaces the earlier next-batch cost allocation. The new additive migration is `database/migrations/20261115_continuous_production.sql`.

The test dataset can be rebuilt with `npm run seed -- --reset` for 1 June–18 November 2026. The command verifies a recovery backup first, preserves login accounts, clears sessions, and creates linked authorisations, individual weighings, movements, invoices, receipts and payroll. See `docs/test-data.md`. Running `npm run seed` without `--reset` changes nothing.
