# Investigation report: records that must stay connected

Investigation date: 15 November 2026

## Test-data reset after this investigation

The earlier dataset and its historical discrepancies described below have now been replaced at your request. The current test database covers 1 June–18 November 2026 and has no unlinked business records or linked-stock discrepancies in the live audit. Existing login credentials were preserved, and a verified pre-reset backup was saved. See `docs/test-data.md` for the new data counts, validation results and recovery path. The earlier findings below remain an account of the investigation, not a claim that those old records still exist in the new dataset.

## Latest continuous-production update

Unfinished material is used **only inside the cost calculation**, following the latest clarification. The separate unfinished-stock panel, recent-balance display, loss-entry controls and public unfinished-stock endpoint have been removed. The estimate does not gate operational corrections. Kernel issues and product receipts remain independent, with one daily production total. See `docs/continuous-production.md` for the internal cost formula and its limits. Earlier panel and batch-costing descriptions below are historical rather than instructions to add extra stock workflows.

## Agreed scope and current update

You asked to leave issue **3** unchanged because the factory does not buy the products it makes. You also deferred issue **13** (who/why action history) and issue **14** (customer payment reversal/refund).

For issue **4**, costing now follows the recorded order of individual batches and dispatches. Materials issued before product weighing remain pending until the next weighing of each product, using the existing 73% PKO / 25% PKC / 2% sludge split. Earlier dispatches do not use later batches. Historical daily totals are labelled separately because their original batch times cannot be recovered.

The database update has been applied to the existing application database. Record counts and received/issued stock totals were checked before and after and remained unchanged.

The other implemented changes include admin batch correction/reversal, employment-period history, payroll review/recalculation, salary displays based on effective dates, saved invoice details, stronger database links, checks across all linked items, repeat-submission protection in the authorisation forms, and safeguards against corrections that create or worsen a later stock shortage.

**Legacy review still requires human confirmation.** Pending Weighing now has an admin section listing older records and possible stock matches. Selecting and confirming exact original entries creates their missing links without changing quantities. Ambiguous or non-matching records remain flagged for manual reconciliation. The 318 older records were not automatically assigned or silently changed.

Paid payroll keeps its original paid amounts. Backdated changes flag it for review; unpaid payroll can be recalculated. Earlier employment gaps and invoice details that were already lost before this update cannot be reconstructed automatically. Existing invoices are initially preserved using the profile details available at migration time; future profile edits no longer change those copies.

The original investigation and examples below explain why these changes were needed. The updated positions under each issue distinguish implemented work, review still needed and work you deferred.

## What the main problem was

One business activity appears in several places in this system. A purchase, for example, has an authorisation, a received quantity, a purchase record and an inventory entry. These are different records, but they describe the same delivery.

Changing one of them must update the others where appropriate. The main fault was that some edit and delete actions changed the business record alone. The inventory entry and authorisation could remain behind.

**Simple example:** You record a delivery of 1,000 kg of kernel. Inventory increases by 1,000 kg. You later delete the purchase because the delivery was entered by mistake. Previously, inventory could still include that 1,000 kg even though the purchase had disappeared. Someone looking at stock could believe the factory had material it never received.

This review followed purchases, sales, production, inventory, payments, invoices, employee records and payroll. It found and fixed several problems, but it also identified work that remains. Passing tests does not mean that all the remaining problems have been solved.

The quantities, dates and amounts in the examples below are illustrations. They are not claims about your actual transactions.

## What was found in your existing data

The database inspection found:

- **Two authorisations whose business records had already been deleted:** one purchase and one production record.
- **Five inventory entries left behind by those deletions:** one purchase receipt, plus the four movements for kernel, PKO, PKC and sludge belonging to the deleted production record.
- **318 older business records without a clear link to an authorisation.** This does not mean all 318 quantities are wrong. It means the system cannot reliably identify the inventory entries belonging to each of those records.

The five clearly identified leftover inventory entries were removed, and their two authorisations were cancelled. A copy of the affected records was saved before making that repair. The batch history was retained.

The follow-up inspection found **no remaining inventory entries pointing to missing or cancelled source records**, and no active authorisations pointing to deleted business records, within the checks performed.

The inspection also found no differences in the surviving linked purchase/sale records checked against their inventory entries, no differences in the checked production totals against their saved batches, and no sales with payments above their total value.

The 318 older records were left unchanged. Their stock entries must be matched carefully rather than guessed.

## Problems already addressed

### 1. Purchase deletion left received stock behind

**Before:** Deleting a purchase could remove the delivery from the purchase page while leaving it in inventory.

**Example:** A mistaken receipt of 500 kg was deleted, but stock still showed an extra 500 kg.

**Now:** For a purchase with a clear authorisation link, deletion removes its generated inventory entry and cancels its authorisation together. It does not remove other deliveries made on the same day. Older records with uncertain stock links are blocked from unsafe correction.

### 2. Sale deletion left issued stock behind

**Before:** Deleting a sale could leave its quantity deducted from stock.

**Example:** An unpaid sale of 200 kg was cancelled and deleted, but inventory still behaved as though the 200 kg had left the store.

**Now:** Deleting an unpaid sale with a clear link also removes its generated stock deduction and cancels its authorisation. Sales with recorded payments are protected from deletion.

### 3. Purchase and sale edits did not update their related records

**Before:** Changing a quantity, item or date could change the purchase/sale page while leaving inventory and authorisation details unchanged.

**Example:** You correct a delivery from 1,000 kg to 900 kg. Purchases show 900 kg, but inventory still includes 1,000 kg.

**Now:** Linked purchase/sale corrections update the business record, authorisation and inventory entry together. If an update fails, those changes are not left half-completed. A sale's ordinary due date also follows a corrected sale date; a separately assigned due date is preserved.

### 4. Generated stock entries could be changed on their own

**Before:** Someone could change or delete the inventory side without changing its purchase, sale or production record.

**Example:** Inventory was reduced from 100 kg received to 80 kg, while the purchase still said 100 kg.

**Now:** Inventory created from another business record cannot be edited or deleted independently. Its source record must be corrected. Manual stock adjustments remain separate.

### 5. Deleting a paid sale could erase its receipts

**Before:** Deleting a sale could automatically delete the payments recorded against it.

**Example:** A customer had paid ₦50,000. Deleting the sale could also remove the evidence of that payment from the system.

**Now:** A sale with payments cannot be deleted. A proper payment reversal/refund process is still needed; that remaining work is explained below.

### 6. Sale edits could conflict with payments

**Before:** A paid sale could be moved to another customer, or its value could be reduced below what had already been paid.

**Example:** A customer paid ₦80,000, but the sale was edited to a total of ₦60,000 without recording what should happen to the ₦20,000 difference.

**Now:** Those changes are blocked. The payment situation must be resolved explicitly.

### 7. Production totals could disagree with saved batches

**Before:** A daily production total could be overwritten without changing the batches that made up that total.

**Example:** Saved batches totalled 600 kg of PKO, but the daily record was edited to 700 kg. Batch history, production and inventory could then tell different stories.

**Now:** The date and quantity totals of linked production cannot be overwritten independently. Hours and downtime can still be updated together with the authorisation. A proper batch correction feature is still required.

### 8. Two payments could be checked against an outdated balance

**Before:** Two payment requests arriving together could both check a balance before the other payment was included.

**Example:** A sale has ₦100,000 outstanding. Two people each enter a ₦60,000 payment at nearly the same time. Both could appear acceptable using the old balance.

**Now:** Payments against the same sale are checked in order against the updated balance. Payment amounts with more than two decimal places are also rejected.

### 9. A repeated batch submission could hide a changed quantity

**Before:** A repeated submission marked as the same batch could receive a success response even if its quantity had changed.

**Example:** A 100 kg batch was saved. A retry using the same submission reference said 120 kg, but the system could report success while retaining 100 kg.

**Now:** An identical retry is accepted safely. A retry with changed quantities or ticket details is rejected with an explanation.

### 10. Some failed corrections and account deletions gave unclear results

**Before:** A missing record could produce an empty success response, or deleting an account used in business history could produce a general error.

**Example:** The system could not delete a manager because their name was attached to past approvals, but it did not clearly explain that relationship.

**Now:** Missing business records and protected account references return clearer responses. Accounts needed to identify who authorised or recorded past work are preserved. Quantity and price checks were strengthened too.

## Remaining issues, with practical examples

**High priority** means the issue can affect stock accuracy, customer money, production cost or payroll. **Medium priority** means it affects reliability, records or controls and still needs attention.

These issues remain unless the text explicitly says a protective restriction has already been added.

### 1. Older records cannot be reliably matched to their inventory entries

**Priority: High**

**What is wrong:** There are 318 older purchases, sales and production records without a clear authorisation link. Knowing that records share a date or an item is not enough to prove they belong together.

**Practical example:** Two suppliers each delivered 500 kg of kernel on Monday. Inventory contains two 500 kg receipts. If one purchase must be deleted, the system cannot safely assume which receipt belongs to it merely because the quantities match.

**What this could mean for you:** A guessed correction could remove the wrong delivery or leave the mistaken one in stock. Until the records are matched, some older records will refuse an edit or deletion instead of risking a wrong stock change.

**What should be done:** Review the old records against delivery notes, scale tickets and other available evidence. Link records only when the match is clear. Keep uncertain cases listed for review.

**Current position:** An admin review screen and linking process are implemented. The 318 older records still need confirmation against original evidence. Missing or ambiguous matches remain protected and flagged; no bulk guessing was performed.

### 2. A saved production batch has no proper correction process

**Priority: High**

**What is wrong:** There is no individual batch correction or reversal feature that updates all related quantities while keeping the original entry visible.

**Practical example:** The store keeper enters 250 kg of PKO, then discovers that the scale ticket says 205 kg. The difference is 45 kg. Changing only the daily production total would leave the batch history or stock incorrect.

**What this could mean for you:** Stock may remain overstated until the mistake is handled properly. Users may be tempted to delete a whole production day when only one weighing was wrong, affecting correct batches as well.

**What should be done:** Add an admin correction action for a specific batch. It should require a reason, retain the original weighing, and update the daily total and stock by the exact difference. Removing a batch should similarly reverse only that batch.

**Current position:** Implemented for admin on an open production day. Correct Batch updates the batch, daily total and stock together. Reverse Batch removes its effect on totals and stock while retaining the original quantities marked as reversed. Finished days must first be reopened by admin. The separate who/why action history remains deferred under issue 13.

### 3. Bought finished goods and factory-produced goods are mixed in costing

**Priority: High**

**What is wrong:** The cost calculation does not properly separate finished goods bought from another supplier from finished goods made by the factory. Some receipt totals include both, while the stock value used for dispatch calculations follows a separate production-based path.

**Practical example:** The factory produces 1,000 kg of PKO and also buys 500 kg of PKO from another company on the same day. There are 1,500 kg in physical stock, but only 1,000 kg came from your production. The bought 500 kg has its own purchase cost.

**What this could mean for you:** The system can spread factory production costs across the wrong quantity or fail to carry the bought goods' value into a dispatch correctly. A sales profit figure may look better or worse than it should even if the stock quantity looks right.

**What should be done:** Keep bought receipts and production receipts separate when calculating their costs, then combine their values according to the chosen stock valuation method.

**Current position:** Deferred at your request: the factory does not buy the products it produces. No separate purchased-finished-goods costing change was introduced.

### 4. Later production can influence the calculated cost of an earlier dispatch

**Priority: High**

**What is wrong:** Costing groups activity by day and puts purchases before material issues, production before dispatches. It does not fully follow the actual order of individual weighings and dispatches within that day.

**Practical example:** A customer collects PKO at 9 a.m. The factory produces a new batch at 3 p.m. The calculation can treat the afternoon production as available when costing the morning dispatch.

**What this could mean for you:** An earlier sale's calculated cost or profit can change when a later batch is added. Intraday profit figures may be misleading.

**What should be done:** Decide whether costing should follow the actual sequence of batches and dispatches or intentionally calculate a final daily average. If using a daily average, clearly mark figures as provisional until the day is closed.

**Current position:** Implemented using recorded batch and dispatch times, with material costs carried forward to the next weighing of each product. Calculation reads one consistent set of records, so a concurrent save cannot produce a half-updated cost report. Old daily records retain an explicit historical-time label.

### 5. Reactivating an employee removes their previous inactive date

**Priority: High**

**What is wrong:** The employee record keeps only one inactive date. Setting the employee back to Active clears it rather than retaining the earlier period away from work.

**Practical example:** An employee leaves on 10 June and returns on 1 August. Once reactivated, the system may no longer know that the employee was away during July. If July payroll is generated afterwards, it can calculate pay as though the employee had remained employed throughout that period.

**What this could mean for you:** Payroll for an earlier month could include days the employee should not have been paid for. This does not mean every existing payroll has already changed.

**What should be done:** Keep a dated history of employment periods, including leaving and return dates. Use that history for payroll calculations.

**Current position:** Implemented from the employment dates available now onward. Leaving and return dates are preserved separately for payroll. Inactive dates are treated as the last working day, inclusively. Gaps erased before this update still need manual review because their dates are no longer known.

### 6. Already-prepared payroll does not respond to backdated changes

**Priority: High**

**What is wrong:** Once a monthly payroll row has been prepared, running preparation again leaves that row unchanged. A later salary or employment-status correction does not mark it for review.

**Practical example:** November payroll is prepared using a salary of ₦120,000. You then enter a salary increase effective from 1 November to ₦150,000. Preparing November payroll again can leave the existing row at ₦120,000.

**What this could mean for you:** An unpaid employee could be underpaid or overpaid because the payroll still uses the earlier information. The user may assume that preparing payroll again has refreshed it when it has not.

**What should be done:** Flag affected unpaid payroll for recalculation and review. If payroll has already been paid, retain that payment record and record a separate adjustment rather than rewriting what was paid.

**Current position:** Implemented: salary/status changes mark affected payroll for review. Preparing payroll recalculates unpaid amounts while preserving bonuses and deductions; paid amounts stay unchanged and are flagged if they differ from the corrected salary calculation. A review flag prevents an outdated pending payroll from being marked paid.

### 7. The employee page's current salary can disagree with salary history

**Priority: Medium**

**What is wrong:** Entering a salary change immediately replaces the salary shown as current, even if the change starts in the future or belongs to an older period.

**Practical example:** Today is 15 November. An employee earns ₦120,000, and you enter an increase to ₦150,000 starting 1 December. The employee page can immediately show ₦150,000, even though November still uses the earlier salary when calculated from the dated history.

**What this could mean for you:** The employee page and payroll may appear to contradict each other. A manager could rely on the displayed salary and communicate the wrong amount.

**What should be done:** Show the salary effective today as the current salary. Show future changes separately, with their start dates. Keep past changes in the history.

**Current position:** Implemented: the employee display reads the salary effective today from salary history. Future-dated salary changes no longer replace the current display.

### 8. Old invoices can change when customer or company details are edited

**Priority: Medium**

**What is wrong:** Opening an old invoice reads the current customer and company details rather than the details saved when that invoice was issued.

**Practical example:** You issue an invoice in October using a customer's old business name. In November, their profile is updated to a new name. Reprinting the October invoice can show the new name.

**What this could mean for you:** Your later copy may no longer match the copy originally given to the customer. This can cause confusion during payment disputes or record checks.

**What should be done:** Save the relevant customer, company and invoice details when an invoice is issued. Later profile changes should apply to new documents. Corrections to an issued document should be recorded as revisions.

**Current position:** Implemented: invoice copies keep saved customer, company and item details, including references to retained logos. Existing invoices are saved using details available at migration time; previously lost original details cannot be recovered. Explicit corrections to the sale itself remain possible under the payment safeguards.

### 9. The database does not enforce every link between stock and its source

**Priority: Medium**

**What is wrong:** The application knows that an inventory entry belongs to a purchase, sale or production record, but the database does not enforce all of those relationships itself.

**Practical example:** An import or maintenance script deletes a purchase directly instead of using the corrected application action. Its received-stock entry could still remain behind.

**What this could mean for you:** The corrected buttons are safer, but a separate tool or script could reintroduce the same kind of leftover records.

**What should be done:** Add database rules that prevent broken links or require dependent records to be handled together. The older unlinked records must be reviewed before introducing rules that they may not satisfy.

**Current position:** Implemented: generated stock must reference an authorisation of the correct type. Database checks reject live authorisations pointing to deleted business records and stock linked to cancelled/unweighed authorisations. Valid corrections can update all related records together before these rules are checked.

### 10. The automatic checks do not cover every stock item

**Priority: Medium**

**What is wrong:** The main comparison checks name selected items such as kernel, PKO and PKC. They do not provide the same coverage for sludge or every purchased consumable.

**Practical example:** A sludge receipt is entered as 20 kg while the matching production figure is 12 kg. Or a diesel purchase and its inventory receipt disagree. Those differences may not appear in the existing automatic checks.

**What this could mean for you:** A page showing no reported differences can give more confidence than the checks justify. Some errors may remain unnoticed.

**What should be done:** Compare all relevant item types and their source records, including missing entries, quantities, dates and units. Clearly state what has and has not been checked.

**Current position:** Implemented for all linked item types, including sludge and consumables. Checks compare individual source records, quantities, items and dates, so opposite errors on the same day cannot hide each other. Manual adjustments and older unlinked records are identified as separate work rather than incorrectly compared as new purchases/production.

### 11. Repeating an authorisation request can create duplicate work

**Priority: Medium**

**What is wrong:** Sale and purchase creation do not have the same repeat-submission protection used for production batches.

**Practical example:** A manager presses Authorise Purchase, but the connection is slow. They submit again because no response appeared. Both requests can create a separate authorisation for the same intended delivery.

**What this could mean for you:** The store keeper could see two tasks and accidentally record the delivery twice, increasing stock twice.

**What should be done:** Recognise a retry of the same authorisation and return the existing result. Also prevent repeated button presses while a request is being processed. Two genuinely different deliveries must still be allowed.

**Current position:** Implemented in the current authorisation forms. Retrying an unchanged entry reuses its submission reference; the server returns the existing authorisation and rejects changed details using that reference. Buttons are disabled while saving. External or older clients must supply an authorisation reference to receive the same retry protection.

### 12. Deleting a receipt can leave later usage without enough stock

**Priority: Medium**

**What is wrong:** Removing the stock entry linked to a deleted purchase fixes that purchase's immediate relationship, but the system does not yet check whether later production or sales depended on that stock.

**Practical example:** Opening stock is zero. You receive 1,000 kg of kernel and use 800 kg in production. If the receipt is then deleted, the recorded balance becomes negative 800 kg unless another valid receipt explains that usage.

**What this could mean for you:** Stock can become negative, and later production-cost calculations may need review. The correct response is not to delete the real production automatically.

**What should be done:** Before an edit or deletion, show whether it would make stock negative or affect later records. Require a reviewed correction that explains where the material actually came from and updates the related valuation where necessary.

**Current position:** Implemented for linked business corrections and manual stock corrections. Before committing, the system compares the stock sequence before and after the change and rejects a new or worsened shortage. A pre-existing shortage is not silently repaired; unrelated historical errors remain separate review work.

### 13. Important actions do not keep a complete who/when/why history

**Priority: Medium**

**What is wrong:** Saved batches retain history, but cancellations, reopening and corrections do not all have a separate permanent action record showing the person, time and reason.

**Practical example:** A finished production day is reopened and later closed again. Looking at its current status does not provide a complete account of who reopened it and why.

**What this could mean for you:** When investigating a disputed quantity or unexpected change, the final number may be visible without a clear explanation of how it changed.

**What should be done:** Record each important action, including the old value, new value, person, time and reason. Keep this history even when the business record is cancelled or corrected.

**Current position:** Deferred at your request. No general who/why action log was added. Employment effective dates are retained specifically because payroll needs them; that is separate from a general user action history.

### 14. Customer payment reversal/refund is not yet a complete workflow

**Priority: High when a paid sale needs cancellation**

**What is wrong:** Paid sales are now protected from deletion, but the application still needs a clear way to handle a mistaken payment, a refund or a sale cancelled after payment.

**Practical example:** A customer pays ₦50,000, then the order is cancelled before collection. Deleting the sale must not erase the receipt. The system needs to show the original payment and what happened to the ₦50,000 afterwards.

**What this could mean for you:** The protective restriction prevents lost payment history, but the user cannot complete the whole correction through a properly recorded refund/reversal process yet.

**What should be done:** Add an admin-controlled process that records the original payment, the reversal or refund, its reason and its effect on the customer balance. Only then should the sale be cancelled or otherwise resolved as appropriate.

**Current position:** Deferred at your request. Paid sales remain protected from deletion, and their receipts are retained. A new customer refund/reversal workflow was not added.

## Original priorities and follow-up review

1. Continue reviewing older stock links using the admin matching screen. Batch correction is now available. Customer payment reversals remain deferred.
2. Use the agreed batch sequence costing. Purchased-finished-goods separation remains out of scope because the factory does not buy its own output products.
3. Preserve employee employment periods and make payroll respond visibly to backdated changes.
4. Use the expanded checks and database safeguards. The general who/why action history remains deferred.
5. Preserve issued invoice details, prevent duplicate authorisations and add warnings for changes that would leave later stock short.

Use the current-position notes above for the implemented status. Human reconciliation remains necessary where historical evidence is incomplete.

## What was tested, and what the results mean

The latest completed test run passed **55 tests**. They cover the existing approval permissions, production reopening, daily numbering, access rules, payroll examples, invoice/payment behaviour and page requirements, together with the new correction protections.

The new checks include purchase/sale edits and deletion, preserving other same-day receipts, preventing independent changes to generated stock, protecting paid-sale receipts, payment limits, production totals matching batches, uncertain older records, accounts referenced by business history and simultaneous payments.

These tests use temporary test tables inside the same PostgreSQL service. They are removed afterwards. They are separate from the existing application tables; you do not need a second application database.

The database inspection checked existing records without modifying them. The only historical data repair made during this investigation was the explicitly identified set of five leftover inventory entries and two authorisations described above.

The test results confirm the cases tested. They do not prove that every old record is correct or that the remaining issues in this report have been fixed.

## Files for follow-up work

- Shared business-record correction logic: `backend/record-corrections.js`.
- Application routes and existing costing/payroll calculations: `backend/server.js`.
- Read-only inspection: `node scripts/audit-dependencies.js`.
- Preview the targeted leftover-stock repair without changing data: `node scripts/repair-orphaned-stock.js`.
- Apply that targeted repair, with a saved copy first: `node scripts/repair-orphaned-stock.js --apply`. It only handles explicit links to source records that no longer exist; it does not reconcile the 318 older unlinked records.

The saved copy from the repair performed in this investigation is:

`/data/user/0/com.foxdebug.acodefree/cache/inventory-orphan-repair-1794701942428.json`
