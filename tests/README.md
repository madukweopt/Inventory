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
