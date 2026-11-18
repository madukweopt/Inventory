# Editing the SOP in the app

Sign in with an **Admin** account and open **SOPs**. Select **Edit SOP**, choose a section and edit its formatted text. The toolbar supports headings, bold text and lists. The section title can be corrected separately. **Preview** shows the text without the editing cursor. **Save changes** publishes the edit to staff and updates the PDF download. **Cancel** leaves the saved manual unchanged.

Manager and Storekeeper accounts can read, print and download the SOP, but cannot load or save the editor. The server checks the current account role on each request; hiding the button is not the permission check.

Edits are stored in PostgreSQL in `sop_revisions`. A save adds a new revision rather than replacing an old one. The original manual is imported as a prior revision on the first save. A version check rejects an older tab if another save happened first, leaving its text available to copy. The section editor keeps the numbered SOP chapter prefixes intact, and server validation requires the app guide and all six SOPs.

The saved revision is the live manual. `docs/SOPs.md` and the generated `public/html/sops.html` supply the starting edition and page layout; rebuilding those files does not replace saved database edits. `docs/SOPs` supplies the PDF before any app edits. Once an edit is saved, the PDF is generated from the same saved revision, using bundled Open Sans fonts and PDFKit; Chromium is not required on the deployed server.

Business test-data resets preserve SOP revisions. Application backups and restores include them. Older verified backups without this table restore with no saved revisions, so the starting edition is used again.

For an existing deployment, install the updated package dependencies and apply `database/migrations/20261116_sop_revisions.sql`. New databases receive the table from `database/schema.sql`. No existing manual or stock data is changed by the migration.

The reading actions stay at the bottom of the screen while scrolling. **Edit SOP** opens the chapter and paragraph currently being read; selecting text before clicking it targets that passage. **Save changes** and **Cancel** also stay within reach while editing. Cancel returns to the original reading position, and a successful save returns to the editing position after reloading the updated manual.
