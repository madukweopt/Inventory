# Automated tests

Run every syntax, backend, database, permission and frontend contract test with:

```sh
npm test
```

The integration tests create a randomly named PostgreSQL schema such as
`inventory_test_a1b2c3d4e5f6`, build empty test tables from `database/schema.sql`,
insert test-only records, run the checks, and delete the entire schema afterward.
They never use the normal `public` tables containing business records.

The test connection uses `TEST_DATABASE_URL` when it is available. Otherwise it
uses `DATABASE_URL`, changes the provider hostname to its unpooled form, and still
works only inside the temporary schema.

Useful commands:

```sh
npm run test:integration
npm run test:frontend
```

- `test:integration` checks the server, database calculations and role access.
- `test:frontend` checks that important page controls and required fields still
  exist and that rejected terminology is not accidentally restored.

If a test fails, its name identifies the affected feature. A failed test exits
with a non-zero status, so deployment services can stop a broken version before
it is released.

Dependency regression tests cover linked purchase/sale edits and deletes, receipt preservation, generated-inventory protection, production batch consistency, legacy-record safeguards and concurrent payment limits. `node scripts/audit-dependencies.js` separately inspects existing data without changing it; see `docs/dependency-audit.md` for its limits and the remaining findings.

Continuous-production checks cover partial output, repeated independent issues, next-day quantity/value carry-forward, separately recorded loss, profit deduction of loss cost, and blocked reversal of material needed by recorded output. Daily cost/profit estimates may change as a day’s receipts are reconciled.

`tests/seed.integration.test.js` tests the complete reset seed inside its own temporary schema, including repeatable resets, preserved accounts, clean stock links, positive demo profit, invoices, existing payment receipts and new receipt/invoice generation after the seed. It never resets application data.
