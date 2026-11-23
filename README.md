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

Payments, manual stock changes and expenses are saved only once even if Save is tapped twice or retried after a lost connection: each form fill sends a one-time key, and the same key returns the entry already saved. The migration is `database/migrations/20261121_submission_keys.sql` (already applied to the development database; apply it to any other database before deploying).

Every successful save, edit and delete made through the app, and every sign-in, is written to the Activity Log (`database/migrations/20261121_activity_log.sql`, already applied to the development database). Each entry keeps the person who really did it, the account in use (so work the Director does through Switch Account is credited to the Director), what was done, which record and when; no request contents or passwords are stored. The Director reads it in Data → Activity Log, filtered by person, record type and dates.

## Database changes (migrations)

Each file in `database/migrations` changes the database once (a new table or column, or a one-time correction of records). The database keeps a list of the files it has received in `schema_migrations`, and **the server applies any new files itself when it starts**, before taking requests, each fully or not at all. If one fails, the server does not start and says which file and why.

- A new, empty database is built from `database/schema.sql` on first start, and every current file is recorded as included.
- To add a change: create a new file named `YYYYMMDD_description.sql` (and add the same change to `database/schema.sql`). Never edit a file that has already been applied; the server warns if one was.
- `npm run migrate` applies new files without starting the server; `npm run migrate -- --status` lists applied and pending files and changes nothing.
- A database that already has tables but no list (set up before this, or by hand) is refused at start. If it is up to date, run `npm run migrate -- --baseline` once: it checks the database against `schema.sql` (every table, column and index) and only then records the files. The development database was baselined on 21 November 2026.

Earlier notes in this README that say a migration was "already applied" describe how it was done by hand before this list existed.

## Automatic test runs

GitHub runs all the tests (`npm test`) every time code is pushed or a pull request is opened, using a fresh temporary database that is thrown away afterwards (`.github/workflows/tests.yml`). Each push shows a green tick when every test passed, or a red cross with the failing test named. If the app is deployed from GitHub (for example on Railway), turn on the host's option to deploy only commits whose checks passed.

The temporary test database has no secure connection, so the test run sets `DATABASE_SSL=disable`. Everywhere else connections are always secure; that setting is refused when `NODE_ENV=production`.

## Moving to the live database (carry-over)

The development database holds test records alongside real ones. Only the real records go to the live database: login accounts (with their current passwords), the basic items, other partners with their jobs and payments, capital assets, and the start-up and prepaid expenses shown on Assets and Start-up Costs. Test sales, purchases, production, stock, customers, suppliers, employees, prices and the demo company details stay behind.

1. `npm run carry-over -- export` writes `carry-over/carry-over-data.json` from the development database. The file holds password hashes and business records: keep it private (Git ignores the folder).
2. Create the new, empty live database and start the server against it once; it builds all the tables.
3. `TARGET_DATABASE_URL=<live database URL> npm run carry-over -- import --confirm-database <live database name> --dry-run` checks everything and shows the counts without keeping anything; run it again without `--dry-run` to copy. The import keeps record numbers (so jobs, payments and assets stay linked), runs all or nothing, and refuses a database that is not set up, already has these records, is the development database, or is not named in `--confirm-database`.
4. Sign in as the Director, enter the real company details on Company Details and the current prices on Prices.

## Price Guide

Price Guide (menu, just before Prices; Director only) shows, for PKO, PKC and sludge, the full cost per kg of the stock held and the price and profit per kg at a 15%, 20% and 30% profit margin (profit as a share of the selling price: price = full cost ÷ (1 − margin)), next to the current price and its margin. Full cost = the app's moving weighted average production cost (kernel, diesel, electricity, losses) + the salaries, rent and running expenses of the days that stock was produced. Running costs are shared over a normal month of production days (26 unless changed on the page): each production day carries one normal day's share, split 73/25/2 like the production cost, and days lost to breakdowns or shortages are shown separately as idle-day cost rather than raising the price. It is a planning tool only (`backend/price-guide.js`); costing, stock values and the dashboard are unchanged.
