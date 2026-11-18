# Continuous production and unfinished material

One authorisation covers each production date. Store keepers use **Issue Kernel** whenever material enters processing and **Receive Product** whenever oil, cake or sludge is weighed. Each receipt selects exactly one product and one quantity. They do not match an output weighing to a particular kernel issue. The existing entry history and correction protections are retained.

## Internal quantity used for costing

Opening unfinished material + kernel issued − weighed oil, cake and sludge − recorded production loss = estimated closing unfinished material.

Example: issue 1,000 kg, receive 900 kg of products, and record 10 kg of confirmed loss. The remaining estimate is 90 kg. Finish Day closes that date's entries and carries the balance forward; it does not empty the machines or return kernel to available raw-material stock.

The difference is an estimate. Unrecorded losses, missing receipts and missing issues can affect it. No historical losses or starting machine quantities were invented. Outputs exceeding recorded available material are flagged for review rather than creating negative unfinished stock.

## Cost carried forward

The app uses daily weighted-average process costs, building on the earlier daily design. Opening unfinished cost is combined with the cost of the day's material issues. The cost per kg of the available in-process material is used to divide value between weighed outputs, recorded losses and unfinished material.

Example: 1,000 kg of issued kernel costs ₦300,000, with no other costs or opening unfinished material. Receiving 900 kg assigns ₦270,000 to completed products and retains ₦30,000 against the remaining 100 kg. A recorded 10 kg loss takes ₦3,000 out separately, leaving 90 kg valued at ₦27,000. Recorded loss cost is shown separately and deducted from the dashboard net-profit estimate. There is no loss-entry screen: Finish Day records the production's kernel used minus its weighed PKO, PKC and sludge as production loss, because Finish Day means all its material has been processed. The loss is costed on the production's last issue or receipt date. Reopening sets it back to zero until the day is finished again.

The existing product cost shares are used to divide completed-production cost between the weighed products of each production authorisation, not each weighing day. Example: cake weighed on Monday and oil weighed on Tuesday under Monday's authorisation share Monday's production cost 25/75 (73/25/2 with sludge). Each weighed kilogram first moves the same mass-based cost out of unfinished material; the authorisation's total is then shared by its whole product mix. While production is open, the mix is incomplete and the allocation remains provisional. Later receipts can change earlier estimates. This is a mass-based cost estimate; it does not measure the actual stage of processing inside machines or prove that normal losses have all been recorded.

Completed products are combined with existing finished stock using weighted average. Intraday cost/profit values remain provisional until the quantities, product mix and losses for the day are reconciled. This daily method supersedes the earlier rule of transferring all pending material cost to the next product weighing and the earlier promise of fixing dispatch cost at each intraday batch.

## Operational scope

Unfinished material is an internal costing estimate. It is not displayed as available stock, as a separate stock category, or as a Pending Weighing panel. There are no new production-loss controls or public unfinished-stock endpoints. It does not block the store keeper's work or corrections based on an estimated in-process balance.

The ordinary purchase, sale and production stock protections remain: corrections cannot independently break their recorded stock movements or worsen actual stock shortages. Manager ownership and admin-only reopening remain unchanged.

Store keepers use Issue Kernel and Receive Products independently under the daily authorisation. Existing records and quantities are unchanged by removing the extra unfinished-stock display and controls.

The additive migration is `database/migrations/20261115_continuous_production.sql`. It adds a zero-default production-loss field without changing existing issued or received quantities.
