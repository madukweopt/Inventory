# Current test dataset

`backend/seed.js` rebuilds the application data for **1 June 2026 through 17 November 2026**, inclusively. The fixtures are deterministic and follow the current application's record relationships. Existing login accounts and their password hashes are preserved; old business records and sessions are cleared.

## Reset completed and verified

The configured test database has been rebuilt for the requested period:

| Records | Count |
| --- | ---: |
| Production days | 171 |
| Individual production entries, including one reversed entry | 1,198 |
| Purchases | 53 |
| Sales/invoices | 570 |
| Payment receipts | 570 |
| Authorisations | 810 |
| Stock movements | 1,649 |
| Employees | 6 |
| Monthly payroll records | 34 |

The live audit reports zero orphan authorisations, orphan stock entries, unlinked business records, linked-stock differences or overpaid sales. Invoice details are saved for every sale. The 15 November demonstration has positive gross margin for each product and positive net profit. All **55 automated tests** passed, including backup restoration and post-seed invoice/receipt generation.

Three existing login accounts were preserved. Sessions were cleared. The pre-reset data is preserved in:

`/public/inventory-safety-backups/before-test-seed-2026-11-15T04-06-28-865Z/application-data.json`

## What is included

- Daily production authorisations initiated by manager and admin accounts.
- Separate kernel issues and individual PKO, PKC and sludge receipts. A second kernel issue occurs before the first issue's output has all been weighed.
- One production total per date, linked to its underlying production entries and stock movements. Each finished day records 1–2% production loss at Finish Day. Some days stay open overnight: their remaining oil, sludge and cake are weighed the next morning with that date as the actual receipt date, then the day is finished.
- Authorised kernel, diesel and electricity purchases with physical receipt quantities and scale tickets. Some kernel trucks are authorised the evening before and received the next day, dated on arrival. One delivery is held for 11.8% impurities, re-authorised at a lower price and accepted two days later.
- Kernel sample tests on every kernel receipt, with a second test on some deliveries.
- Daily Usage entries for electricity and diesel, recorded by the Storekeeper, and "none used" diesel confirmations on some days.
- Product sales with their own authorisations, physical dispatches, scale tickets, invoices and saved customer/company details. Some collections are authorised the evening before and dated on dispatch.
- A delivery note for every sale, signed by the driver before dispatch was confirmed. Five factory-weight sales have a Director price correction with its reason shown on the delivery note. Factory-weight and customer-weight sales are both included. Customer-weight buyers often weigh slightly less; those differences are approved by the Director and shown as delivery shortfall. The last two days include notes awaiting the buyer's weighing and awaiting Director approval.
- Fully paid, partly paid and unpaid invoices, with separately numbered payment receipts. Some invoices have multiple payments. Some wrongly entered payments are reversed with a reason and followed by the correct payment.
- Director stock changes with reasons: PKO spills, sludge disposals and PKC count differences.
- Pending purchase/sale authorisations without stock movements, cancelled unused authorisations, and an open production day on 17 November.
- A corrected production entry and a reversed entry retained in history without changing its day’s final quantity.
- Six employees, salary changes, an inactive/return period, an employee leaving employment, and monthly payroll. Completed months are paid; November is pending.
- Monthly product prices, daily running expenses, company details, customers and suppliers.
- Factory rent of ₦1,200,000 paid on 5 January for January to December, with the 5 months before production as start-up costs, and factory insurance of ₦360,000 for 12 months from 1 June. Both are spread at ₦100,000 and ₦30,000 a month.
- Three other partners: a fabricator, an electrician and a machinery dealer. Set-up jobs before 1 June (expeller, crusher, roaster, settling tank and panel wiring) are capital assets, one with ₦800,000 still owed. Repair and service jobs during the period create running expenses, one part-paid. Two assets bought outright from one-off sellers are entered directly in Capital Assets.

All historical input/output quantities reconcile. Finished days have no material left in production; only the open final date keeps **200 kg** inside production for costing. This amount is not displayed as an extra stock category.

The selling prices deliberately exceed the modelled product costs so normal demonstration days show positive gross and net profit. Unpaid sales still count as sales; payments and outstanding balances are shown separately.

## Running the seed

`npm run seed` only prints instructions. It does not change the database.

`npm run seed -- --reset --confirm-database <database name>` first creates and verifies a recovery backup, then replaces the test records inside a single transaction. A validation or database error rolls the data reset back. Without `--confirm-database` naming the database in `DATABASE_URL`, or when `NODE_ENV` is `production`, the reset stops before changing anything. The date range defaults to the period above; `--start` and `--end` can select a different test period.

The seed uses a native PostgreSQL dump when a compatible client is available. Otherwise it saves a checksum-verified application-data backup, preserving exact database JSON row values and sequence states. That backup has been tested by restoring it into an isolated schema. Database structure is not dropped by the reset.

Backups and seed reports are saved outside the repository under `/public/inventory-safety-backups/before-test-seed-*`. The backup contains account hashes and business data and is kept private. If a required account role did not already exist, a new test account is generated and its password is saved only in that backup folder's `new-test-logins.json`.

For an `application-data.json` backup, `npm run seed -- --reset --confirm-database <database name> --restore /path/to/application-data.json` restores the saved data into the existing compatible database structure. This command backs up the current data first too. A native `database.dump` is restored with the matching PostgreSQL tools.

Existing users can sign in with their previous usernames and passwords. Sessions are cleared during the reset, so sign in again afterwards. The IDs/sequences are synchronised so newly created invoices, receipts, authorisations and other records continue correctly after the fixtures.

## Verification

Before committing, the seed checks record links, production entry totals, stock movements, non-negative running stock, invoice/payment references, price dates, overpayments and the requested date range. Pending and cancelled authorisations do not create physical movements.

`tests/seed.integration.test.js` builds the full dataset in an isolated temporary schema, exercises login roles, completed/pending records, reopening and cancellation permissions, invoice and receipt generation after seeding, payroll, costs and profit, then checks that repeating the reset preserves the accounts and yields the same fixture counts. The temporary schema is removed afterwards.
