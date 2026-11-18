# Kernel sample quality tests

In **Data → Purchases Data**, open a **P Kernel** purchase and expand **Kernel quality · Sample tests**.

When receiving an authorised **P Kernel** purchase in **Pending Weighing**, the Storekeeper can tick **Record a sample test with this receipt** and enter both weights. The receipt and first test save together. An invalid test prevents the receipt from completing, so it can be corrected without creating partial stock records. The test is optional; more tests can be added later on Purchases Data.

Storekeepers and admins can record the total sample weight before sorting and the separated impurity weight. Both weights are in grams, with up to three decimal places. The sample must be positive; impurities can range from zero to the full sample weight.

The form calculates the result before saving. Each saved test includes its date/time and the user who recorded it. Managers can view tests. Admins can delete an incorrect test and record a replacement.

- Individual impurity percentage = impurity weight ÷ sample weight × 100.
- Combined impurity percentage = all impurity weights ÷ all sample weights × 100.
- Clean kernel percentage = 100 − impurity percentage.

For example, 40 g impurities in a 1,000 g sample gives 4%. Adding a second sample of 500 g with 50 g impurities makes the combined result **90 ÷ 1,500 × 100 = 6%**, rather than the simple average of 4% and 10%.

These are quality records only. They do not reduce received stock, change purchase costs, adjust supplier payments, or change production costing. A result of 0% appears only after recording a sample with no impurities; an untested delivery is shown as having no tests.

Tests belong to the purchase. Deleting the purchase removes its tests. A purchase with tests cannot be changed to a different material until an admin removes the tests. Retry references prevent a repeated save from adding the same test twice.

## Database update

Existing installations need `database/migrations/20261115_kernel_impurity.sql` applied before deploying the updated server. The migration is additive and can be run again safely. New databases receive the table from `database/schema.sql`.

The seed reset and application backup/restore routines include the quality-test table. Older verified application backups are still supported and restore with no sample tests.
