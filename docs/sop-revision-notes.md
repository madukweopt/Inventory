# SOP revision — 16 November 2026

The current editable source is **SOPs.md**. The current PDF is **SOPs** (a PDF without a filename extension). The uploaded original is preserved at **archive/SOPs-original-2026-11-16.pdf**.

Changes made across the manual:

- Director-led palm kernel procurement, with delegation to the Manager within approved limits.
- Storekeeper ownership of all physical weights and measurements; no duplicate Manager quantity reports.
- Authorise Purchase → Storekeeper Confirm Receipt, with one linked purchase/inventory entry.
- Sample testing at first receipt or later, in grams, with weighted combined results and no automatic stock/payment deductions. The original 10% company acceptance limit remains; acceptance exceptions are handled by the Director, not an automatic app gate.
- One daily production authorisation, independent kernel issues and single-product receipts, daily accumulation, Finish Day and Director-only reopening.
- Continuous production and safe interruption procedures without waiting for input/output batch matching or withholding measured entries overnight.
- Approved saved selling prices, Storekeeper dispatch quantities, invoices, payment records and receipts, with Director payment/release approvals kept as management controls.
- Explicit distinction between Storekeeper source logs and Director-only manual inventory controls for consumables, returns, electricity usage and disposal without dedicated Storekeeper screens.
- Physical machine procedures, the unconfirmed machine settings, maintenance, safety and housekeeping rules retained. Duplicate subsection numbering and PDF line-break artefacts corrected.

The authenticated reader is **/sops.html**, with **/sops.pdf** for the revised download. All staff roles can access it. SOPs buttons appear in the shared navigation panels.

After editing the Markdown source, run `node scripts/build-sops.js` to rebuild `public/html/sops.html`. Regenerate and verify the PDF before distributing a new revision. The generated reader links every contents item to its section; its print layout expands the main contents and removes the app navigation.

## Receiving responsibility clarification

When kernels enter the factory, the Storekeeper takes responsibility for receiving, inspection, sampling and weighing. She accepts deliveries that satisfy all checks and approved terms. She holds an unsatisfactory delivery and sends the Director her findings and reasons for not accepting it. The Director decides rejection, exceptional acceptance, further checks or price renegotiation. The sourcing Manager cannot override the inspection. Any revised price must be authorised before the Storekeeper confirms receipt.

The manual now uses **Director** consistently. Operators are responsible for lifting, unloading and loading. Bag-weight deductions are optional and are made only on the Director’s instruction; the receiving record states the weighing basis.

The pre-update revision is preserved in `archive/SOPs-before-receiving-update-2026-11-16.pdf` and its matching Markdown file, in addition to the original uploaded PDF.

## Plain-English edition

The manual was rewritten with shorter sentences, clear job owners and numbered steps. App button names remain exact, with a simple word guide at the start. Long blocks of role labels were split into separate lines. Joined settings, broken hyphens, awkward phrases and missing spaces were corrected. Sample calculations and bag-sampling examples use separate tables.

The approved duties, acceptance rule, optional bag-weight deduction, production workflow and safety requirements were kept. Machine settings that have not been agreed remain unfilled. The previous edition is preserved in `archive/SOPs-before-plain-English-2026-11-16.md` and its matching PDF.

## In-app editing

Admin accounts can now edit the formatted manual from the SOP reader. Saved revisions in the database take priority over the starting Markdown/HTML edition. The PDF is generated from the same saved text. Building the starting HTML does not overwrite live revisions. See `sop-editor.md` for editing, deployment and backup details.
