# DECISIONS.md — Kayani Autos / Kiyan Traders Business Management System

Log of individual decisions with rationale. `CLAUDE.md` holds the current-state
summary; this file holds the history and the "why." Newest entries at the top.

---

## 2026-09-10 — Restructured the nav into modules; deferred role-based visibility

**Decision:** Mehmoon flagged that the nav bar (8 flat buttons after Deal
Part shipped) had gotten unwieldy for counter staff who need POS
reachable fast. Discussed two shapes before building: a flat "primary +
2 dropdowns" split, and a proper module structure (POS standalone, then
Sales/Inventory/eventually Purchasing/Accounting/Reports as named
modules) mirroring how the confirmed five roles roughly map to areas of
the app. Went with the module structure - it scales cleanly as later
phases add whole new areas, rather than needing another nav rework each
time.

**Key design choices:**
- **POS and Parties stay standalone, always-visible tabs** - not
  grouped into a module - since POS specifically is the "fast counter
  operation" screen (CLAUDE.md 1) and Parties is used from both Sales
  and future Purchasing.
- **Sales module**: Quotations, Delivery Notes, Sales History.
  **Inventory module**: Inventory, Stock Adjustment, Deal Parts. Chosen
  along "what does this role mostly touch" (CLAUDE.md 5.8/6's five
  confirmed roles) rather than build-order, so it maps sensibly once
  role-based visibility exists.
- **No placeholder Accounting/Reports modules added yet.** Neither has
  schema, and the client's own answer on Reports ("bear with me for
  reports") means the list isn't even confirmed - an empty module tab
  would be a dead link, not a real feature.
- **Grouping is visual only.** Every view stays reachable by every
  logged-in user in this pass - nothing was gated. Role-based tab
  visibility (driven by the existing but unused `roles`/`permissions`
  schema, seeded with a sensible default per role but editable later,
  matching Ghaus's own "I can choose or edit at any time" answer on
  permissions) was discussed as the deliberate next layer, explicitly
  **not** built now. **Follow-up, Mehmoon 2026-09-10:** this specifically
  waits for an Admin Settings / Roles module - a real screen for
  managing `roles`/`permissions` - rather than being bolted onto the
  nav ahead of that screen existing. Sequencing, not a scope change.

**Verified end to end through the real UI**: confirmed the nav renders
as POS Counter / Sales ▾ / Inventory ▾ / Parties; opened each dropdown
and confirmed its three members render, closing on selecting one and
navigating correctly; confirmed a module button stays highlighted while
its dropdown is closed if the current screen belongs to it (e.g. Sales
stays highlighted while viewing Sales History); confirmed clicking
outside the nav closes an open dropdown without navigating.

**Source:** Mehmoon, 2026-09-10.

---

## 2026-09-10 — Built real Deal Part (Form C)

**Decision:** Built Deal Part over the other two candidates on the table
(Invoice-from-DN, wiring Stock Adjustment's ledger into real sales) -
Mehmoon's choice. First bundling feature: two or more Items sold and
printed under one manually-typed name.

**Key design choices:**
- **`deal_parts` + `deal_part_components`, no price and no stock on
  either.** Matches the confirmed spec exactly - "the bundle itself
  never holds stock... pricing is decided at time of sale, not cached on
  the Deal Part definition." The components table only records the
  recipe (which parts, how many of each per bundle).
- **Selling one reuses `sales_document_lines`, not a new line table.**
  Made `controlPartId` nullable and added a nullable `dealPartId` -
  exactly one of the two is set per line, enforced at the application
  layer (same pattern already used for the discount/phone-number caps),
  not a database CHECK constraint.
- **Scoped to POS checkout only for actually selling a bundle.** Only
  `checkoutLineSchema` (sales.ts) was widened to accept `dealPartId`;
  Quotation's and DN's own line schemas are untouched and still require
  `controlPartId`, so neither can create a Deal Part line yet - kept
  deliberately narrow rather than touching three document-creation flows
  in one pass. `GET /api/sales/:id` (shared by Sales History and DN's
  "convert from Quotation" flow) still had to be updated regardless,
  since it reads every document type through one endpoint - `partNumber`
  is now nullable, `catalogName` is always present via
  `COALESCE(controlParts.name, dealParts.printName)`. DN's own "from
  Quotation" line picker now filters to lines that actually have a
  `controlPartId` - not a real scenario yet since Quotation can't
  produce a Deal Part line, but the type is honestly nullable now, so
  the UI shouldn't quietly assume otherwise.
- **"A Deal Part sale posts stock movement against the underlying
  Items" was NOT built.** No sales feature of any kind - checkout,
  Quotation, or DN - touches the `stock_movements` ledger yet (built for
  Stock Adjustment). This is a pre-existing, already-flagged gap; Deal
  Part didn't introduce it and doesn't need to be the one to close it.

**Found and flagged, not fixed here:** while reading `sales.ts` for this
work, noticed POS checkout calls `snapshotPartyTaxInfo(partyId)` but
discards the result, unlike Quotation and DN, which both save it. Every
checkout Invoice with a party attached has been saving `null` for
customer GST/NTN instead of the party's real values. Spun off as a
separate task rather than folded into this change, since it's an
unrelated pre-existing bug.

**Verified end to end through the real UI** (plus curl for the
regression/rejection checks): created a bundle ("Oil Change Combo," two
components) through the new Deal Parts screen; added it to a POS cart,
where it showed as "Deal part" in place of a part number; entered a
gross price and checked out (KT-INV-0004, Rs 750.00); confirmed it in
Sales History with the correct name, "Deal part" label, and total.
Separately confirmed via curl that a regular part-only checkout still
works unchanged, and that a line with both or neither of
`controlPartId`/`dealPartId` set is rejected with 400.

**Source:** Mehmoon, 2026-09-10.

---

## 2026-09-10 — Client answered a direct question list; chart of accounts confirmed final, five-role list confirmed

**What happened:** Mehmoon received two files from the client: `chart of accounts.xlsx`
(re-sent) and a new `Question list.docx` containing the client's own written answers to a
question list Mehmoon had sent. Extracted both (`unzip` + a throwaway Node script for the
`.docx`'s `word/document.xml`, and Node + shared-string resolution for the `.xlsx` - same
"no pandoc/real Python on this machine" workaround already logged in CLAUDE.md section 13)
and compared against what this repo already assumes/has built. Full verbatim Q&A preserved
in `docs/planning/client-qa-2026-09-10.md`.

**Chart of accounts.xlsx: no new content.** Verified cell-by-cell against what's already
seeded (`src/db/schema/accounts.ts`, `src/db/seed.ts`) - exact match, same file/version
already logged as "version 2" in CLAUDE.md section 4 (updated to match on 2026-09-08). Also
contains the same 19-item Reports list and 9-item Vouchers list already known from
`kayani-erp-full-export.md`.

**Question list.docx: real, resolving content.** Several open items moved:

1. **Chart of accounts confirmed final** ("Chart of accounts are final but you should
   define coding in a way to create space for future expansion... reports would be based on
   classification on the basis of party form.") - this is the client sign-off CLAUDE.md
   section 4 previously said was still missing. Two explicit requirements attached: coding
   must be expansion-ready (no scheme given yet), and report classification runs through
   the Party Form, not the account code alone. The one thing not explicitly addressed: the
   possible duplicate-looking Income Tax Payable/GST Payable pair - treating it as accepted
   as-is since the client didn't flag it when confirming the list as final.

2. **Five-role list confirmed.** Asked "how many user roles... list the staff types," the
   client answered with exactly the five roles already seeded in this repo (Counter
   Control/Corporate Control/Receipts-Payments Control/Inventory Control/Management
   Control) - this retires the competing three-tier Owner/Manager/Cashier candidate that
   CLAUDE.md section 6 flagged as equally unconfirmed. **Per-role permissions are still
   open** - asked directly what each role should be allowed to do, his answer was "It has
   to be flexible and I can choose or edit at any time," which confirms the
   runtime-configurable-permissions principle already assumed but gives no default
   permission matrix.

3. **1A vs Control Part Form relationship - largely resolved.** Asked to explain the
   connection, the client described the same three-step chain already built (Markers
   Control Form -> Item Creation Form -> Control Part Number, parent/child linking), not
   the more elaborate "Form 1A governs fields a)-h) of Form A" reading pulled from the
   handover doc's transcription. Treating the simpler, already-built structure as
   confirmed. Still open: exactly where Form A's lettered fields/RPP/SAP/Print
   Name/Safety Stock Days sit within that chain - his answer to a related question ("what
   info do you record for a new part" -> "as per item creation form... detailed
   discussion again if need be") suggests he's open to a concrete walkthrough, not that
   this is settled.

4. **Reports list: still NOT final**, despite the chart of accounts being confirmed. His
   own words: "bear with me for reports." The three-way Reports/Vouchers conflict in
   CLAUDE.md section 8 stays open. He did confirm report *visibility* maps to the five
   confirmed role groups.

5. **Migration source question did not land.** Asked to name his current system and share
   sample Excel files, his answer - "All is through system except that info is not
   structured. Moreover couldn't understand what you are asking" - shows the question
   itself needs rephrasing, not that there's nothing to migrate. No files were shared.
   Still open, CLAUDE.md section 9.

**Updated:** CLAUDE.md sections 4 (chart of accounts), 5.2 (1A/Control Part), 5.8/6
(roles), 8 (reports), 9 (migration), 11 (open-questions list) to reflect all of the above.
New source file `docs/planning/client-qa-2026-09-10.md` added, referenced from CLAUDE.md's
top-of-file pointer list alongside the other two planning documents.

**Not done:** no schema or code changes - this was a documentation-only reconciliation
pass, consistent with how the 2026-09-08 planning import was handled (log first, build
later, once the client's answers are digested).

**Source:** `Question list.docx` and `chart of accounts.xlsx`, sent by the client (Ghaus
Kayani), relayed by Mehmoon, 2026-09-10.

---

## 2026-09-10 — Built real Stock Adjustment (Form F), plus the first stock-quantity ledger

**Decision:** Built Stock Adjustment (CLAUDE.md 5.7) over the other two
candidates on the table (Invoice-from-DN, Deal Part) - Mehmoon's choice.
Doing this properly required first introducing something that didn't
exist anywhere in the schema: a tracked stock quantity. Every sales
feature built so far (checkout, Quotation, DN) lets staff "sell" parts
without ever touching a quantity-on-hand figure, because none existed -
this was a real gap, not a design choice, and had to be closed before
Stock Adjustment could show "current qty" at all, per the client's own
described flow.

**Key design choices:**
- **Asked before building on top of the gap.** Rather than silently
  picking a schema shape for stock tracking, presented the two real
  options - a single mutable `quantity_on_hand` column vs. an append-only
  movement ledger - and Mehmoon chose the ledger.
- **New `stock_movements` table** (`src/db/schema/stock-movements.ts`):
  current quantity for a part is `SUM(quantity_delta)` over its rows, not
  a stored running number. Chosen over a mutable column because it
  matches the client's own audit-trail requirement for this exact form
  and avoids a schema rewrite once LIFO cost layers (CLAUDE.md "LIFO must
  be deliberate") are eventually built - those will also want a
  per-movement record, not a single number that gets overwritten.
- **`movementType` enum has only `"adjustment"` today.** Deliberately not
  building sale/purchase movement types now - checkout, Quotation, and DN
  still don't touch this table. Adding those integrations is separate,
  future work, not part of this pass.
- **No draft/post lifecycle for the adjustment itself.** The client's own
  notes describe a single-step flow (pick item, see qty, enter delta and
  a comment, done) unlike Quotation/DN/Invoice's confirmed Post/Unpost
  pattern. Built that way rather than inventing an approval gate the
  client didn't ask for - flagged as `[unclear — confirm]` in case one is
  actually wanted.
- **"On posting, SAP is adjusted as a consequence" (client's note) was
  NOT built.** SAP doesn't exist as a schema field anywhere - Form A,
  RPP, and SAP were never built - and its exact business definition is
  still flagged as unconfirmed (CLAUDE.md 5.11 glossary). Adding a
  guessed-at SAP column just to make that line true would mean building
  on a concept nobody has confirmed the meaning of yet.
- **"Mandatory, detailed comment" enforced as non-empty text only** - the
  client's notes don't give a specific length or format for "detailed,"
  so no arbitrary character minimum was invented. Left to staff
  discretion/training instead of a guessed-at rule.
- **History list intentionally does not show a per-row running balance.**
  It's capped at the most recent 100 rows across all parts; a balance
  computed only from that window would be wrong for any part with older
  movements outside it. "Current quantity" is only ever reported freshly
  computed from the full ledger, never approximated from a partial page.

**Verified end to end through the real UI** (plus curl for the two
validation-rejection cases): searched and selected a real part with zero
recorded movements, confirmed the screen showed "Current quantity: 0";
adjusted +25 with a reason comment and confirmed the screen updated to
25 and the new row appeared in the history list; adjusted -8 with a
different comment and confirmed the screen updated to 17 and both
entries show newest-first with correct signs; separately confirmed via
curl that a zero-delta adjustment and an empty reason comment are both
rejected with 400.

**Source:** Mehmoon, 2026-09-10.

---

## 2026-09-09 — Built real Delivery Note creation, plus generic Post/Unpost

**Decision:** Built the second document type in the confirmed
Quotation -> DN -> Invoice chain - `POST /api/delivery-notes`, using the
same `sales_documents` table with `documentType: "delivery_note"`. Chosen
next because it's the step that actually exercises `sales_document_links`
(existed since the schema pass, only ever validated in a rolled-back test
transaction until now) and because it's the first document that needs a
real, user-facing Post/Unpost action - Invoice (checkout) posts itself
immediately, Quotation never posts, so DN is the first place this pattern
had to actually be built and used from the UI.

**Key design choices:**
- **Always created `status: "draft"`**, unlike checkout's Invoice - a DN
  needs an explicit separate Post step, per the confirmed Post/Unpost
  pattern (CLAUDE.md 5.9).
- **Two entry modes in `DeliveryNoteView.tsx`**: "Prepare directly" (same
  search-and-build-lines pattern as checkout/Quotation) and "From
  Quotation." For the conversion path, **line selection is individual, not
  whole-document** - the user checks which specific Quotation lines carry
  over and can edit each selected line's quantity independently (e.g.
  convert 2 of 5 units on one line, skip another line entirely). This
  matches the confirmed spec directly (an Invoice can already draw
  partially/combine across multiple DNs, so DN drawing partially from one
  Quotation is the same shape of requirement, one level up the chain).
- **Post/Unpost built generically on `sales_documents`**, not as a
  DN-specific endpoint - `POST /api/sales/:id/post` and
  `.../unpost` reject a Quotation outright (400, "Quotations are
  informational and are never posted") and reject posting an
  already-posted document or unposting a non-posted one. This means the
  same two endpoints will work unmodified once Invoice-side manual
  post/unpost is ever needed too, not just DN.
- **Unposting does not clear `postedAt`.** Deliberately preserves the
  audit fact that the document *was* posted at some point - only the
  `status` flips back to `"unposted"` (a distinct value from `"draft"`,
  already in the enum). `[unclear — confirm]` whether a separate
  `unposted_at` timestamp is wanted later for a fuller audit trail.

**Two real bugs caught and fixed during this work, neither from user
feedback - both self-caught before/during verification:**
1. **In the new code:** the "From Quotation" line-resolution logic
   initially tried to submit a Quotation line's `partNumber` (a display
   string like "CP-10042") as the DN line's `controlPartId`, because
   `GET /api/sales/:id` never actually returned the real `controlPartId`
   UUID in its line objects. Caught before any testing - fixed by adding
   `controlPartId` to that endpoint's response schema, its Drizzle query,
   and the frontend's `SalesDocumentDetail` type, instead of working
   around the missing field.
2. **In pre-existing code, found while browser-testing this feature:**
   `LoginView.tsx`'s `pressDigit`/`pressBackspace` read `pin` directly
   from closure (`setPin(pin + digit)`) rather than using React's
   functional updater. Rapid consecutive PIN-pad taps landing in the same
   render batch silently dropped earlier digits - confirmed directly by
   firing four synthetic same-tick clicks (1-2-3-4) and observing the
   actual network request carry `pin: "4"` instead of `"1234"`. This is a
   real production risk for a touchscreen PIN pad meant for fast counter
   use, not a testing artifact - a staff member tapping quickly enough
   could get "Invalid PIN" on a correct PIN. Fixed to
   `setPin((prev) => ...)` on both functions.

**Verified end to end through the real UI** (not just curl, which is what
the earlier backend-only pass for this feature had relied on): created a
standalone DN (KT-DN-0002) via "Prepare directly"; created a Quotation
with two lines (KT-QTN-0003); switched to "From Quotation," selected only
one of its two lines, reduced that line's quantity from 5 to 2, and
confirmed the running total updated to Rs 1000.00 (2 x Rs 500) before
submitting (KT-DN-0003); confirmed via Ctrl+H that both entries appear in
Sales History with correct status badges; opened KT-DN-0003 from Sales
History and clicked Post, confirming the badge flipped to POSTED and the
button flipped to Unpost; clicked Unpost, confirming the badge flipped to
UNPOSTED and the button flipped back to Post; and confirmed the
Quotation's own detail view shows no Post/Unpost button at all, matching
the "Quotations are never posted" rule.

**Source:** Mehmoon, 2026-09-09.

---

## 2026-09-09 — Built real Quotation creation

**Decision:** Built the first creation path for a document type other
than Invoice - `POST /api/quotations`, using the existing `sales_documents`
table with `documentType: "quotation"`. Chosen over Stock Adjustment (the
other candidate on the table) because it closes a real gap: Kiyan
Traders' described workflow is corporate customers buying on credit via
Quotation -> DN -> Invoice, and until now the only real sale-creation path
was POS-style immediate checkout, which doesn't match how KT actually
says it operates.

**Key design choices:**
- **Always `status: "draft"`, never `"posted"`.** CLAUDE.md 5.10/handover
  8.1 are explicit that a Quotation "is just a subsidiary record and
  requires no accounting" - the one document in the chain that doesn't
  follow post/unpost. No `postedAt` is ever set.
- **Extracted real shared logic into
  `src/server/services/sales-document-helpers.ts`** - party GST/NTN
  snapshotting, control-part existence checks, and the subtotal/discount/
  total math were identical between checkout and quotation creation (not
  superficially similar, the actual same rules), so this is genuine
  duplication removal, not premature abstraction. Checkout was refactored
  to use the same helpers and re-verified afterward to make sure nothing
  regressed.
- **Party stays optional** on a Quotation, matching Invoice, rather than
  guessing it should be required - `[unclear — confirm]`.
- **Reused the Kiyani-Autos-only discount rule** on Quotations too, for
  consistency with the document chain's "identical behavior" convention
  (CLAUDE.md 5.9) - but that rule was only ever confirmed for a "sale"
  (checkout), not explicitly for Quotations. Flagged, not assumed silently.
- **Confirmed Quotation-specific fields work**: Customer Ref, Our Ref
  No., P.O. No., Vehicle Details, Validity - all already existed on
  `sales_documents` from the original schema pass, so no schema changes
  were needed for this feature at all.

**Verified end to end through the real UI** (not just curl): selected a
real entity and customer, searched and added a real part, entered a PO
number, created the quotation, confirmed the regression test on checkout
still passes after the refactor, confirmed the exact row in the database
(status "draft," correct customer ref, correct party, correct total), and
confirmed the quotation shows up correctly in Sales History (Ctrl+H)
right alongside invoices, since both share the same table.

**Source:** Mehmoon, 2026-09-09.

---

## 2026-09-09 — Built Sales History, opened with Ctrl+H

**Decision:** Built the first way to see a sale again after checkout
creates it. Every invoice (`KA-INV-0001`, `KT-INV-0001`, etc.) had only
ever been visible via a direct SQL query run for Mehmoon - a real shop
needs to look one up itself.

**API** (`src/server/routes/sales.ts`): `GET /` lists `sales_documents`
joined to entity and party name, newest first, with an optional `q`
matching document number or party name and an optional `legalEntityId`
filter. `GET /:id` returns the full detail - header plus line items
(joined to the catalog for part number/name) and discount rows.

**Ctrl+H shortcut**: Mehmoon asked for the history to open with Ctrl+H
specifically. Implemented as a `window` keydown listener in `App.tsx`
with `preventDefault()` (Ctrl+H would otherwise open the browser's own
History page) - matches the F1-F9 lookup-shortcut convention already
confirmed for this project (CLAUDE.md 5.9), just extended to a
whole-screen lookup rather than a per-field one. **Not the final
implementation** - this is a page-level keydown handler because the app
currently runs in a browser tab for dev purposes; once this moves into
the actual Electron shell, Ctrl+H should become a proper menu
accelerator (Electron's `globalShortcut` or a menu item `accelerator`),
which is more reliable and doesn't depend on the page having focus.
Still added to the nav bar too, for discoverability and mouse users -
per CLAUDE.md's own "non-technical staff" constraint, a shortcut alone
isn't enough.

**Verified end to end**: pressed the actual Ctrl+H key combination (not
just clicked the nav tab) and confirmed it opened the screen, confirmed
every invoice created across this session's testing lists correctly,
and opened one invoice's detail panel to confirm its line items,
quantities, prices, and total all match what's in the database.

**Source:** Mehmoon, 2026-09-09.

---

## 2026-09-09 — Built Party management and wired it into checkout

**Decision:** Built the first real CRUD for the Party Form (CLAUDE.md
5.5) - `parties`/`party_phone_numbers` already existed in the schema
since 2026-09-08 but nothing had ever used them. Added a `Parties` nav
tab and wired a party picker into the POS checkout, which was walk-in-
only until now.

**Key design choice - the POS party picker filters to Nature "S3"
(Customer Receivable A/C) only**, not Status. Reasoning: Status
(C1/C2/C3) is a commercial/pricing tier, Nature (S1/S2/S3) is what
determines which ledger account family a party posts against - a
vendor/supplier (S1/S2) isn't someone you'd sell to, so filtering by
Nature felt like the right axis. Flagged `[unclear — confirm]` in
CLAUDE.md since this is an interpretation, not something the client
explicitly confirmed. The Party *management* screen itself does NOT
filter - it manages every party regardless of Nature, since vendors and
suppliers need records too, just not in the checkout picker.

**API** (`src/server/routes/parties.ts`): `GET /` (list, optional `q`
name search and `nature` filter) and `POST /` (create party + its phone
numbers in one transaction). `sales.ts`'s checkout now accepts an
optional `partyId`, validated against the real `parties` table if
provided, and stored on the created `sales_documents` row - still
optional, so a walk-in sale (`partyId` omitted) works exactly as before.

**Frontend:** `PartyView.tsx` - a list of existing parties plus a create
form with human-readable Status/Nature labels (e.g. "S3 · Customer
Receivable A/C") rather than showing the bare codes, since the codes
alone aren't self-explanatory. `PosView.tsx` gained a party `<select>`
in the cart panel, defaulting to "Walk-in customer".

**Verified end to end**: created two parties (one Customer Receivable,
one Vendor/Supplier) through the real UI form, confirmed the
vendor/supplier one does NOT appear in the POS party picker (nature
filter working), completed one checkout on Kiyani Autos with a real
party attached and one on Kiyan Traders with a different real party,
and confirmed both invoices show the correct party in the database
afterward.

**Source:** Mehmoon, 2026-09-09.

---

## 2026-09-09 — Built the real Inventory screen (markers/items/control parts CRUD)

**Decision:** Built full CRUD for the three-step inventory structure plus
car-model fitment, completing the original 3-screen UI concept with a
real counterpart for the one screen that didn't have one yet (Login and
POS already did).

**Deliberately built against the schema exactly as it exists**, not a
redesign: `control_parts.itemId` stays a single required FK (one item
owns a control part), even though the client's actual notes (CLAUDE.md
5.3) describe control parts attaching to multiple items. That relationship
is already flagged `[unclear — confirm]` pending a client walkthrough
(CLAUDE.md 5.2) - building a CRUD UI is not the moment to quietly resolve
an open schema question. If/when that conversation happens and the
relationship changes, this UI will need to change with it.

**API surface** (`src/server/routes/inventory.ts`): list/create for
markers, items, control parts, and car models, plus attach/detach
endpoints for control-part-to-car-model fitment. List endpoints return
joined context (an item's marker, a control part's parent part number and
fitment list) using the same two-query-then-merge-in-JS pattern already
used in the parts-search endpoint, rather than reaching for Drizzle's
relational query API (no `relations()` helpers exist on this schema yet).

**Caught and fixed before shipping:** a real bug in the fitment-delete
route - `eq(a, x) && eq(b, y)` was used instead of Drizzle's `and()`
helper. Both `eq()` calls return truthy SQL objects, so `&&` silently
evaluated to just the second condition, meaning the delete would have
matched on `carModelId` alone and could delete a fitment link belonging
to a different control part. Fixed before it was ever run against real
data.

**Frontend:** new `AppHeader.tsx` (nav bar) and `InventoryView.tsx`,
wired into `App.tsx` alongside the existing `PosView.tsx`. Mirrors the
original static mockup's structure (markers rail -> items row -> control
parts list with parent/child + fitment tags) but now backed by real data
and real writes.

**Verified in-browser**: created a real marker, drilled into a real item,
added a new variant control part with a parent link (showed "Variant of
CP-10042" correctly), and attached fitment both to an existing car model
and to a brand-new one created inline - all confirmed matching in the
database afterward.

**One quirk worth noting, not fixed:** during rapid automated testing, one
fitment-attach request showed as aborted in the browser's network panel
and its tag didn't render immediately, even though the write had actually
succeeded (confirmed in the database) and rendered correctly after a page
reload. Reads as a display-timing artifact from firing UI actions faster
than a human would, not a real persistence bug - flagged in CLAUDE.md in
case it recurs under normal use, not treated as resolved or as broken.

**Source:** Mehmoon, 2026-09-09.

---

## 2026-09-09 — Built real POS checkout: cart, entity-gated discounts, a real posted invoice

**Decision:** Extended the POS screen from search-only to a full checkout,
creating a real `sales_documents` row (type `invoice`) rather than just
displaying data. This is the first thing in the project to actually use
`document_number_counters` - that table existed since the first schema
pass but nothing had ever assigned a real number before this.

**Document numbering implementation** (`src/server/services/
document-numbers.ts`): an atomic `INSERT ... ON CONFLICT (legal_entity_id,
document_type) DO UPDATE SET last_number = last_number + 1 RETURNING`
against the existing unique index - Postgres serializes concurrent
writers on that row automatically, so no explicit row locking was needed
for a single local Postgres instance. Formatted as
`{ENTITY_CODE}-{TYPE_CODE}-{4-digit number}`, e.g. `KA-INV-0001`.
**Not confirmed with the client** - no numbering scheme was ever
provided (same open item already logged for chart-of-accounts codes).
The entity short codes (KT/KA) are a hardcoded lookup in this service,
not a schema column, since `legal_entities` has no short-code field and
adding one for two entities that aren't going to change felt like
premature schema surface.
**Explicitly does NOT solve** the multi-terminal-offline collision risk
already flagged on that table's schema comment - this project has one
terminal so far, so that risk isn't exercised, but this function must not
be assumed safe once a second terminal exists.

**Checkout flow decisions:**
- **Posted immediately, not draft.** A walk-in/counter sale is final at
  the point of sale - the post/unpost pattern (CLAUDE.md 5.9) is aimed at
  the corporate Quotation -> DN -> Invoice document-chain workflow, not
  a one-step POS checkout. Revisit if that reading turns out wrong.
- **No price catalog field used or added.** Staff type the gross price
  per line in the cart, matching the confirmed "gross-price-entry
  pattern" (CLAUDE.md 5.9) exactly - this isn't a gap, it's what the
  client's own notes describe.
- **Amounts always recomputed server-side** from quantity x
  unitGrossPrice, never trusted from the client, even though this is an
  internal-only app - cheap to do correctly from the start.
- **Discount gating enforced server-side**: rejects with a clear 400 if
  Kiyan Traders tries to send any discount, and the request schema caps
  discounts at 2 directly. A discount total exceeding the sale's subtotal
  is also rejected (400), rather than allowing a negative total.
- **No party attached** - `partyId` stays null (walk-in only). No party-
  picker UI exists yet.
- **New `GET /api/entities`** so the frontend's entity selector shows
  real data, not hardcoded KT/KA options - same "don't invent data"
  principle as everywhere else in this project.

**Verified by actually using it in the browser**: switched to Kiyani
Autos, searched and added two real parts, entered gross prices, added an
itemized discount (only offered because Kiyani Autos was selected), saw
the total compute correctly (970 - 100 = 870), checked out, and got back
a real assigned number (`KA-INV-0001`) - confirmed directly against the
database afterward: correct subtotal/discount/total, correct line items,
correct discount row.

**Source:** Mehmoon, 2026-09-09.

---

## 2026-09-09 — Restyled the vertical slice to match the approved UI concept

**What happened:** Mehmoon saw the plain, unstyled login/search screens
and (correctly) pointed out they didn't look like the approved design
concept. That was intentional at the time (proving the real data path
mattered more than visual polish for that first pass), but once asked,
restyled both screens for real rather than just explaining it away.

**What changed:** login and search screens now use the same design
tokens as the approved concept (`https://claude.ai/code/artifact/
ba934bdb-...`), including the accent-color and 44px touch-target fixes
already made to that concept after its own accessibility review - real
KT/KA logos, a numeric PIN pad, and the confirmed business contact
footer. The staff picker is backed by a NEW real endpoint
(`GET /api/auth/staff`) rather than hardcoded, since a picker showing
fake names would repeat the exact mistake this whole vertical-slice
effort was meant to move away from.

**Verified in-browser**, clicking through for real: staff picker loads
the real seeded user, the PIN pad correctly builds and submits a PIN
digit by digit, login succeeds and lands on a matching-styled search
screen, and search still returns real joined results afterward.

**Not done:** the Inventory screen from the original 3-screen concept
has no real-data equivalent yet - only Login and (a version of) POS
counter search exist so far.

**Source:** Mehmoon, 2026-09-09.

---

## 2026-09-09 — Fastify over Express; built the first real running vertical slice

**Context:** Mehmoon asked when the app would actually be usable/visible,
not just schema and a static mockup. Correct observation - everything
built so far only existed as SQL-visible schema or a non-interactive
design concept. Agreed to pause adding schema breadth and prove one real
path end to end instead: real login, real search, real Postgres, running
in a browser.

**Decision: Fastify, not Express**, for the backend (CLAUDE.md section 3
listed both as options, undecided). Discussed first rather than picked
silently, per the standing "ask before architecture decisions" rule.
Reasoning:
- The usual Fastify-over-Express argument (2-3x raw throughput) doesn't
  apply here - this serves a handful of terminals in one shop talking to
  a local Postgres on the same machine, not internet-scale traffic.
- What does apply: this app is essentially dozens of structured forms
  (Forms A-G). Fastify's built-in Zod-based request validation with type
  inference pays off repeatedly across that many endpoints; Express needs
  a bolt-on library for the same thing.
- Consistency with the Drizzle-over-Prisma rationale already in this
  file: "lighter runtime, better fit for the background sync worker" -
  same philosophy, already decided once.
- Faster startup / smaller footprint fits an Electron-embedded backend
  that spins up fresh every time a shop terminal launches.
- Express's real advantage (larger ecosystem, more third-party middleware)
  mostly doesn't get used here - this is a closed, single-tenant app with
  no third-party integrations beyond Supabase and eventually FBR's API.

**Implementation choices made without a separate ask** (lower-stakes,
logged for visibility, not treated as architecture decisions needing
sign-off):
- **Zod** for request/response validation (`fastify-type-provider-zod`) -
  a common, well-supported pairing with Fastify.
- **bcryptjs**, not the native `bcrypt` package, to hash PINs - pure JS,
  no compiled binary, for the exact same "clean Electron packaging"
  reason Prisma was ruled out. `users.passwordHash` (written generically
  before the PIN-pad login concept existed) now explicitly holds a bcrypt
  hash of the numeric PIN.
- **Vite + plain React in the browser first, Electron later.** Fastest
  path to something real and clickable today; Electron is just a shell
  around the same frontend, so wrapping it can happen once there's more
  to wrap.
- Frontend lives in `web/` (separate from `src/`, which is NodeNext-mode
  for the backend) with its own `tsconfig.json` (bundler resolution,
  JSX) so the two don't fight over module resolution settings.

**What got built** (`src/server/`, `web/`):
- `POST /api/auth/login` - real bcrypt check against `users`, returns the
  user's actual roles via a real join through `user_roles`/`roles`.
- `GET /api/parts/search` - real query against `control_parts`, joined to
  `items`/`markers` for context and `part_car_models`/`car_models` for
  fitment. Deliberately does NOT return a stock/quantity number - no
  inventory ledger exists yet, and the earlier UI mockup's fake stock
  numbers were exactly the kind of invented data this pass was meant to
  stop doing.
- `src/db/seed-dev-data.ts` - a NEW, separate seed script for local-dev-
  only sample data (one demo user, two sample parts, one fitment link) -
  kept separate from `seed.ts` specifically so that file's "only
  confirmed business data" scope stays honest.
- A minimal React frontend (login screen, search screen) calling both
  endpoints for real, proxied through Vite in dev.

**Verified by actually using it**, not just curling it: logged in through
the real browser UI with a wrong PIN (rejected), the right PIN (real user
name and role appeared), searched for a real part (correct results with
fitment), and searched for a non-existent part (correct empty state).

**Explicitly not done in this pass:** no visual styling matching the
approved design concept, no session/token handling (login just returns
the user object for now - fine for a local desktop app, not something to
carry into a hosted context unmodified), no Electron packaging yet.

**Source:** Mehmoon, 2026-09-09.

---

## 2026-09-09 — Built first-pass Sales document chain (Quotation/DN/Invoice)

**Decision:** Built `sales_documents`, `sales_document_lines`,
`sales_document_links`, and `sales_document_discounts`
(`src/db/schema/sales-documents.ts`) per CLAUDE.md 5.9/5.10 — the actual
Phase 2 deliverable now that Party exists to support it.

**Key design choices:**
- **One shared header table with a `documentType` discriminator**
  (quotation/delivery_note/invoice), not three separate tables. The three
  document types share almost every field, and the client's own notes
  explicitly ask for identical line-sequencing and Print Name behavior
  across all three - matching that in three parallel tables would mean
  tripling the same logic. The tradeoff: Quotation's "never actually
  posted" rule (CLAUDE.md 5.9) is enforced in application logic, not the
  schema, since it shares `salesDocumentStatusEnum` with DN/Invoice rather
  than getting its own more restrictive status type.
- **`sales_document_links` is many-to-many, not a single
  `previous_document_id` column** - the client's notes are explicit that
  one Invoice can merge lines from several DNs combined, and (by the same
  reasoning) more than one DN could plausibly be raised from one
  Quotation by picking different items each time.
- **Discount lines are their own table**, not a discriminated line-item
  type, because they don't share fields well with a real product line (no
  control part, no quantity, no tax breakdown) - just a label and a flat
  amount. The "Kiyani Autos only, max 2" rules live in the application,
  not a DB constraint (a CHECK can't reach the parent row's entity without
  a trigger) - same pattern already used for `party_phone_numbers`.
- **`controlPartId` is required (not nullable) on line items for now**,
  because Deal Part (bundling) and the "generic catch-all item" for
  uncatalogued parts both need their own reference and neither is built
  yet. Flagged as an extension point rather than guessing at their shape.

**Deliberately scoped out, not oversights:**
- **Settlement channels / payments.** CLAUDE.md's own build-phase table
  puts "settlement channels" under Phase 4 (Accounting), not Phase 2
  (Sales) - building a payments table now, before the Vouchers module
  (CLAUDE.md section 8) is designed, risks two competing mechanisms for
  the same concept later. This also sidesteps the open question of
  whether a sale can split across multiple channels - no schema commitment
  either way yet.
- **Margin alerts / override logging** (CLAUDE.md 5.10) - needs a real
  cost figure from the LIFO cost-layer engine, which doesn't exist. An
  inert "margin override" column with nothing to compute against would be
  a half-finished feature.
- **Actual tax computation.** `lineTaxAmount` and `taxTotal` columns exist
  to hold a result, but no tax-rule engine was built - the "gross price
  in, system computes the breakdown" pattern is a future application-layer
  concern, not a schema one.

**Verified end to end against the live local database** (inside a rolled-
back transaction): a full Quotation -> DN -> Invoice chain via
`sales_document_links`; a per-invoice renamed line ("Oil Filter") resolving
correctly alongside its unchanged catalog name ("Oil Filter - Standard");
a discount line correctly dropping an invoice's total from Rs 900 to
Rs 700; and FK rejection of a bad `control_part_id`. No data left behind.

**Source:** Mehmoon, 2026-09-09.

---

## 2026-09-08 — Built first-pass Party Form schema

**Decision:** Built `parties` and `party_phone_numbers`
(`src/db/schema/parties.ts`) per CLAUDE.md section 5.5 (Form "D").

**Why this one next:** it's small, fully specified (only one minor
transcription question - "O2" vs "C2"), and it was already a dependency
of work sitting unbuilt in the schema - four chart-of-accounts rows say
"status of party-wise" with nothing to classify against. It also unblocks
the Sales document chain and Reports module, both of which reference
Party throughout. The alternative candidate (reworking Inventory to match
the real Item Form/Control Part Form spec) was passed over for now
because it still has an unresolved client-dependent ambiguity (the
1A-vs-Control-Part-Form relationship, CLAUDE.md 5.2) and would mean
reworking already-seeded tables - lower risk to do Party first.

**Design choices:**
- Status (`C1`/`C2`/`C3`) and Nature (`S1`/`S2`/`S3`) modeled as enums,
  not admin-editable tables - same reasoning as `account_category`: fixed
  business classifications tied to pricing/ledger logic, not something
  staff invent new values for at runtime.
- Phone numbers as a child table (`party_phone_numbers`), not an array
  column, so each number can carry its own audit columns consistently
  with the rest of the schema. The "1 to 5 phones" cap is an
  application-layer rule, not a DB constraint - a count check would need
  a trigger, overkill for a UI-level limit.
- `printName` nullable, falls back to `name` at display time - the
  simplest of the three Print Name patterns already documented
  (CLAUDE.md 5.9), so no special-casing needed here.
- No `legal_entity_id` on `parties` - nothing in the confirmed spec ties
  a party to one entity, and adding one without confirmation would
  contradict the existing "entity separation lives at the application
  layer, don't invent structural entity tags" principle.

**Verified against the live local database:** applied the migration,
inserted a corporate party with two phone numbers and a wholesale party
with a custom print name inside a transaction, confirmed both resolve
correctly in a join query, confirmed the `party_status` enum rejects an
invalid "O2" value, then rolled back (no data left behind - this repo's
established validation pattern).

**Not done:** nothing links to `parties` yet - chart-of-accounts
party-wise reporting, Sales documents, and Customer/Supplier ledgers
still need to reference it once built.

**Source:** Mehmoon, 2026-09-08.

---

## 2026-09-08 — Updated chart-of-accounts schema/seed to match the verified spreadsheet exactly

**Decision:** After directly verifying `chart of accounts.xlsx` cell-by-cell
(previous entry), Mehmoon asked to update the built schema to match it.
Done.

**Changes:**
- Added a nullable `note` text column to `chart_of_accounts`
  (`src/db/schema/accounts.ts`) to carry the client's own "status of
  party-wise" / "status of party-wise on the basis of LIFO" annotations
  verbatim - these previously had no home in the schema at all. New
  migration `drizzle/0001_black_la_nuit.sql`, purely additive.
- Rewrote every account name in `src/db/seed.ts` to the spreadsheet's
  exact wording, including preserving "Cost of Good Sold" (singular,
  presumably a typo in the client's own file) rather than silently
  "fixing" it - the point was to match the source, not to improve on it.
- Moved "GST Withheld" and "Income Tax Withheld" from Current Assets to
  Income/(Loss) (renamed to ".../Payable Account", both status-of-party-wise)
  to match the spreadsheet - this is a category change, not just a rename.
- Added the accounts that were simply missing before: "JS Kiyan Traders"
  (6th bank account, entity-tagged to Kiyan Traders), "Provision for Parts
  inventory stock at LPP" (Equity & Reserves), "Current provision for
  Parts inventory stock at LPP" (Income/(Loss), a distinct line from the
  Equity one), "Income Tax Payable Account", "GST Payable Account"
  (Equity & Reserves), "Travelling Expense Account".
- Truncated the local dev database's `chart_of_accounts` table (disposable
  test data, nothing else references it) and re-ran migrate + seed fresh,
  rather than trying to rename rows in place.

**Verified after reseeding:** 40 rows total, category counts match the
spreadsheet exactly (3/14/6/2/15), the 4 notes attached to exactly the
4 accounts the spreadsheet marks, 6 bank accounts entity-tagged, every
other row's `legal_entity_id` still null, no stale old-wording rows left
behind, seed still idempotent on a second run.

**Not resolved:** this makes the repo's schema match the *spreadsheet*,
not necessarily what the client ultimately wants - see the "what remains
open" note in CLAUDE.md section 4 (the possible duplicate tax-payable
accounts, and whether version 2 itself needs correcting).

**Source:** Mehmoon, 2026-09-08.

---

## 2026-09-08 — Verified the actual chart-of-accounts spreadsheet against the transcription

**What happened:** Mehmoon attached the client's actual `chart of
accounts.xlsx`. Opened it directly (Node + SheetJS, since this machine has
no real Python install - only the Windows Store stub alias; noted as an
environment gotcha below) and compared cell-by-cell against the
transcription already in `docs/planning/kayani-erp-full-export.md` section
2.

**Result: exact match.** Every chart-of-accounts line (all 5 sections),
all 19 numbered reports, and all 9 vouchers are identical to the
transcription, including which specific accounts carry the "status of
party-wise" / "on the basis of LIFO" annotations. This was not a
summary-of-a-summary error - the transcription is accurate to the source.

**Consequence for the three-way COA conflict logged in the previous
entry:** this doesn't resolve which conceptual version the client wants
going forward, but it does confirm "version 2" (the 2026-09-07 spreadsheet)
is a faithful, directly-verified primary source - the strongest-provenance
of the three versions, since it's an actual file from the client rather
than a chat summary or memory. Recommend treating it as the working
default once the client confirms, rather than the memory-held earlier
version.

**Also confirmed, not a transcription artifact:** the apparent duplication
flagged in the previous entry - "Income Tax Payable Account" / "GST
Payable Account" under Equity & Reserves, alongside "Income Tax
Withheld/Payable Account" / "GST Withheld/Payable Account" (status-of-
party-wise) under Income/(Loss) - is genuinely in the client's own file.
Still worth confirming with Ghaus rather than assuming either is a mistake.

**Not done:** no schema or seed data changes. `src/db/schema/accounts.ts`
and `src/db/seed.ts` still reflect the shorter, earlier "version 3" and
have not been updated to match this verified spreadsheet - that's a
seed-data change worth confirming before making, not assumed here.

**Environment note:** this machine has no real Python (`python`/`python3`
resolve to the Windows Store install-stub, `py` launcher isn't present).
The xlsx skill assumes a preconfigured Python + openpyxl/pandas/markitdown
environment that doesn't exist here - worked around this once with a
throwaway Node + SheetJS script instead. Worth installing real Python if
spreadsheet work becomes routine.

**Source:** `chart of accounts.xlsx`, attached by Mehmoon, 2026-09-08.

---

## 2026-09-08 — Imported full planning-account context; found and flagged real gaps

**What happened:** Mehmoon had a separate Claude.ai Project (the "planning
account" referenced throughout this file and CLAUDE.md) holding substantially
more project context than had made it into this repo. Since Claude Code has
no access to another Claude Project, he ran an export prompt in that Project
and pasted the output here as two files: `kayani-erp-full-export.md` and
`kayani-erp-project-handover.md`. Both are now preserved verbatim in
`docs/planning/` so future sessions can go back to source material rather
than a summary of a summary (the planning doc's own stated lesson from an
earlier mistake - see CLAUDE.md section 12).

**What this surfaced, in order of how much it matters:**

1. **The discount open question is resolved.** The handover doc (section
   6.1) states discounts are itemized for Kiyani Autos only; Kiyan Traders
   uses net-of-discount pricing with no separate line. This independently
   corroborates what Ghaus told Mehmoon live the same day ("which sometimes
   happens just at Kiyani Auto" - see the 2026-09-07 discount entry below).
   Two independent sources agreeing is about as confirmed as this gets
   without the client explicitly signing off in writing. Logged in
   CLAUDE.md section 5.10. **Follow-up not yet done:** the POS mockup
   currently shows the itemized discount UI unconditionally - it should be
   gated to the Kiyani Autos entity view once the mockup is touched again.

2. **This repo overstated the roles/Authority-Levels confirmation status.**
   CLAUDE.md previously said "five roles confirmed." Per the actual planning
   history, that five-role list (Counter Control / Corporate Control /
   Receipts-Payments Control / Inventory Control / Management Control) was
   one of *two* candidates discussed with the client - the other being a
   three-tier Owner/Manager/Cashier model - and *neither* was actually
   confirmed. This repo's RBAC schema and seed data
   (`src/db/schema/users.ts`, `src/db/seed.ts`) already seeded the five-role
   list as `is_system: true`, as if it were settled. Not unwinding the seed
   data now (it's inert placeholder data, nothing depends on it yet), but
   flagging clearly - see CLAUDE.md section 6 - so nothing further gets
   built on that assumption before the client actually confirms one
   structure.

3. **Chart of accounts is now a three-way conflict, not the single
   confirmed list this repo previously treated it as.** The planning
   export already flagged two non-matching versions across earlier
   sources; reconciling against what's actually seeded in this repo
   (`src/db/schema/accounts.ts`) reveals it matches neither exactly - a
   third version. The *structural* design (flat COA, entity tag only at
   the bank-account level) is unaffected and still correct regardless of
   which content-version wins, and stays validated against a real local
   Postgres. But the actual line items need the client to pick one version
   before anything downstream (reports, ledger posting rules) gets built
   against them. Full diff in CLAUDE.md section 4 and
   `docs/planning/kayani-erp-full-export.md` section 4.1.

4. **Reports/Vouchers is a three-way conflict too**, not previously
   flagged in this repo at all since no reports work had started. See
   CLAUDE.md section 8.

5. **Whole modules exist in the client's actual notes that this repo's
   schema has no representation of yet**: Party Form (customers/vendors,
   with independent Status C1/C2/C3 and Nature S1/S2/S3 classification),
   Deal Part (sales-time bundling), Stock Ordering, Stock Adjustment, and
   the full Quotation -> Delivery Note -> Invoice document chain with its
   post/unpost pattern. None of this was scoped for the current schema
   pass regardless, but it's now documented in CLAUDE.md section 5 with
   pointers to the full field-level spec, so it doesn't get missed when
   that work starts.

**Also recovered:** the client's actual field-level Item Form spec (lettered
fields a-i, Form A), which is meaningfully richer than the simplified
three-step `markers -> items -> control_parts` schema already built - e.g.
Item Code is meant to double as a future barcode, and the `car_models`
table is missing several fitment fields (frame/engine name, CC,
transmission, fuel) that the client's actual Control Part Form (Form B)
specifies. Flagged in CLAUDE.md sections 5.2-5.3 rather than reworked
immediately, since reworking already-built and seeded schema is itself a
decision to confirm, not something to do silently mid-import.

**Not done:** no schema changes were made as part of this import - only
documentation (CLAUDE.md rewrite, this entry, `docs/planning/` added).
Whether/how to reconcile the already-built schema against the richer spec
is a separate decision for Mehmoon to make, not assumed here.

**Source:** Planning-account Claude Project export, relayed by Mehmoon,
2026-09-08.

---

## 2026-09-07 — Client feedback: per-invoice item name override

**What happened:** Ghaus Kayani wants to change an item's displayed name
while making an invoice, without changing the item's actual catalog name —
the changed name shows only on that printed invoice.

**How this will be handled:** this is a property of an invoice **line
item**, not of the catalog item itself. It belongs in the invoice/sale
schema (not built yet - see "what's next" candidate #3, invoices/ledger/
LIFO engine). When that schema is built, each invoice line item gets its
own nullable display-name field that overrides the catalog `control_parts`
/ `items` name for print/display purposes only; the catalog record is
never touched. No schema exists to add this to yet, so nothing was changed
in `src/db/schema/`.

**Action taken now:** added the UI affordance to the POS counter mockup so
the concept is visible before that schema work starts — one cart line
shows a shortened name ("Oil Filter" instead of "Oil Filter - Standard")
with an edit icon and a caption stating the catalog name is unchanged.

**Source:** Client (Ghaus Kayani) via Mehmoon, 2026-09-07.

---

## 2026-09-07 — Client feedback: itemized flat-amount discounts on a sale

**What happened:** Ghaus Kayani reviewed the UI concept (relayed by
Mehmoon). Feedback: general direction is fine on the face of it but final
judgment needs an in-person walkthrough. One concrete gap: no way to apply
a discount, which "sometimes happens" at Kiyani Auto. He wants it
**itemized** (one or two separate named discount lines on a sale, not a
single lump-sum field) and entered as a **flat Rupee amount, not a
percentage**.

**Action taken:** Added an itemized discount line ("Special discount -
Rs 200") to the POS counter cart mockup, with a remove control and an
"Add another discount (max 2)" affordance, flowing into the total. This
lines up with the existing "Discount Expense Net" line already in the
confirmed chart of accounts (CLAUDE.md 4.4) - the ledger side was already
anticipated, just not the POS-side entry point until now.

**Not resolved - needs Mehmoon/client to clarify:** whether discounting is
a Kiyani Autos-only behavior (never applied on Kiyan Traders/GST-registered
sales) or available on both entities and it just happens to come up at
Kiyani Autos in practice. This matters for whether discount logic is
entity-conditional or universal once the real invoice/sale schema is
built (which doesn't exist yet - this is still mockup-only, no schema
change made). Tracked in CLAUDE.md open questions.

**Source:** Client (Ghaus Kayani) via Mehmoon, 2026-09-07.

---

## 2026-09-07 — Real brand assets and business contact info received

**What happened:** Client provided the two real logos (`Kiyan Traders Logo.png`,
`Kiyani Auto Logo.png` — Kiyani Autos trades as "Kiyani Auto Toyota") and the
business's address/phone/email for use on the app and printed
invoices/documents. See CLAUDE.md section 1 for the actual values.

**Action taken:** Swapped the placeholder wordmark/icon in the UI concept
(login screen, POS counter top bar) for the real logos - downsampled from
~500KB to ~34KB each via .NET `System.Drawing` (no ImageMagick/Pillow/sharp
available on this machine) since the design canvas keeps images under
~70KB. Added the address/phone/email as a footer line on the login screen
(the only screen so far resembling a "cover page" for the business; no
invoice/receipt document template exists yet to put it on properly).
Deliberately did NOT put a single entity's logo on the Inventory screen's
top bar - inventory is the shared pool across both entities, so branding it
to one company would misrepresent that.

**Not resolved:** whether printed documents show this contact info once
per entity or shared once for both (client gave one set covering both) -
tracked in CLAUDE.md open questions.

**Source:** Provided by Mehmoon, 2026-09-07.

---

## 2026-09-07 — UI/UX: exploratory concept pass, not lock-in; accessibility floors set

**Decision:** Before starting any UI/UX work, confirmed two things with
Mehmoon: (1) the AnyDesk review of the client's current system — previously
a hard blocker per this file and CLAUDE.md section 5 — is done, so UI work
is unblocked; (2) this first pass is an **exploratory style-direction**
concept (visual language + 3 sample screens: staff PIN login, POS counter,
inventory), not full lock-in across every workflow. Delivered as a design
canvas artifact: https://claude.ai/code/artifact/ba934bdb-69f8-4233-a70a-c6c26412aeaf

Visual direction: glassmorphism-influenced (frosted-glass panels for
structural chrome only — top bars, containers), but every actual
interactive control (buttons, inputs) is solid and high-contrast, never
glass, because the audience is blue-collar counter/inventory staff, not a
consumer app audience. Sora (headings) + Manrope (body) from Google Fonts;
amber/orange accent (`#c2410c`).

**Two usability floors adopted for this build and going forward:**
- Interactive touch targets: **44px minimum** height/width (not the 24-32px
  common in dense desktop UI). A background review of the first draft found
  several controls (cart quantity steppers, delete/edit icon buttons) built
  at 26-32px; all were corrected to 44px before this was shown.
- Text-on-color contrast: **WCAG AA** (4.5:1 for normal/small text, 3:1 for
  large bold text). The first draft's default accent (`#e8823a`) only hit
  ~2.9:1 against white button text and was replaced with `#c2410c` (~5.2:1)
  before this was shown. The color options offered alongside it
  (`#2563eb`, `#047857`, `#7c3aed`) were each checked against the same
  4.5:1 floor.

**Rationale:** Client feedback loop is still open (client has looked at the
concept and asked whether things are "missing" — expected, since only 3 of
many needed screens exist and nothing is wired up yet). Documenting the
scope decision and the two accessibility floors here so they don't get
re-litigated per-screen as more screens are built, and so the planning
account stays in sync on why this isn't a finished UI.

**Not yet resolved:** no interactivity (static mockups only), no
accounting/ledger/reports/settings/permissions-admin screens, no
mobile/tablet layouts, no error/empty/loading states. These are open scope,
not oversights - to be picked up once the client has reacted to the
direction shown so far.

**Source:** Confirmed with Mehmoon, 2026-09-07.

---

## 2026-09-07 — Standard audit columns on every table

**Decision:** Every table gets `created_at` / `updated_at` (timestamptz,
default now()). Transactional/user-editable tables additionally get
`created_by` / `updated_by` (nullable FK to `users.id`).

**Rationale:** Cheap to add now; expensive to backfill once real data exists.
Implemented uniformly (all tables get all four columns) rather than picking
and choosing per table, to keep the schema predictable.

**Source:** Confirmed with Mehmoon, 2026-09-07.

---

## 2026-09-07 — Currency stored as `numeric(14,2)`, not integer paisa

**Decision:** Money amounts (once invoice/ledger/costing tables are built)
will use Postgres `numeric(14,2)` in whole rupees, not `bigint` paisa.

**Rationale:** Exact decimal arithmetic, standard for accounting, avoids a
divide-by-100 step at every read/report layer. No money-bearing tables exist
yet in this pass (chart of accounts stores no balances), so this hasn't been
used in code yet — it's the standard to apply once invoices/ledger/inventory
costing are built.

**Source:** Confirmed with Mehmoon, 2026-09-07.

---

## 2026-09-07 — UUIDv7 primary keys; sequential document numbers kept separate

**Decision:** Every table's primary key is a UUIDv7 (not v4, not
serial/bigserial), generated in the application via the `uuidv7` npm package
(`$defaultFn`), not a Postgres-side default — keeps it independent of the
server's Postgres version. Human-facing invoice/receipt numbers are a
separate sequential value per legal entity, generated independently of the
UUID PK, and are the only identifier ever printed on documents or sent to
FBR — UUIDs are never client-facing.

**Rationale:** Multiple offline terminals will create rows before any sync
happens. Client-generated UUIDs need no central authority to avoid
collisions. v7 (vs v4) is time-ordered, which avoids the local Postgres
write-path index fragmentation that random v4 UUIDs cause. Sequential
integers as PKs were rejected because two offline terminals can independently
create "row 1."

**Open question this decision surfaced (not resolved):** the sequential
document-number scheme (see `document_number_counters` in
`src/db/schema/documents.ts`) assumes one active writer at a time per legal
entity + document type. If two terminals can be offline simultaneously and
both issue, say, Kiyan Traders sales invoices, they will independently
increment their own local counter and collide once they sync. Needs a
decision (pre-allocated number blocks per terminal, or restricting invoice
creation for a given entity to one terminal at a time) before this is relied
on for FBR submission.

**Source:** Confirmed with Mehmoon, 2026-09-07.

---

## 2026-09-07 — Drizzle over Prisma

**Decision:** Drizzle ORM, not Prisma.

**Rationale:** No bundled binary query engine, so Electron packaging stays
clean. Raw-SQL control needed for LIFO costing logic. Lighter runtime, better
fit for the background sync worker.

**Source:** Confirmed with Mehmoon prior to this session; logged here
retroactively since this file didn't exist yet. See `CLAUDE.md` section 3.

---

## 2026-09-07 — Implementation details decided without a separate ask

These are lower-stakes technical choices made while scaffolding the schema —
logged here for visibility, not treated as architecture decisions requiring
sign-off, since they're easily changed later without a data-shape impact.

- **Postgres driver:** `postgres` (postgres.js) over `pg` (node-postgres).
  Pure JS, no native bindings, lighter — consistent with the same rationale
  already used to pick Drizzle over Prisma. Swappable later with no schema
  impact.
- **`account_category`** (the 5 chart-of-accounts headers) modeled as a
  Postgres enum, not an admin-editable table like `roles`/`permissions`.
  These are fixed accounting classifications (asset/liability/equity/income),
  not business-configurable roles — unlike roles, they shouldn't need
  runtime editing.
- **`document_type`** on `document_number_counters` is free-text
  (`varchar`), not an enum, because the full list of document types
  (sales invoice, delivery challan, receipt/payment voucher, etc.) isn't
  finalized yet. Enums require a migration to extend; free text doesn't.

---

## Open items carried from CLAUDE.md (tracked here so they don't get lost)

Do not resolve these silently. See `CLAUDE.md` section 6 and inline
`[unclear — confirm]` comments in the schema for full context.

- ~~Exact relationship between the Markers/Items form and the Control Part
  form~~ — **largely resolved 2026-09-10**, client confirmed the same
  three-step chain already built. See CLAUDE.md section 5.2 for the
  narrower remaining gap (where Form A's fuller field set sits in that
  chain).
- Whether "parent/child linking" in the inventory structure applies at the
  Control Part level (as modeled), the Item level, or across all three.
- Whether a user can hold more than one role at once (`user_roles` modeled
  as many-to-many to avoid foreclosing either answer).
- **Authority Levels module** — the five-role *list* is now confirmed
  (2026-09-10, CLAUDE.md sections 5.8/6), but per-role permissions and
  whether "Authority Levels" (Form G) is the same concept as this RBAC
  scaffold are both still open. Do not extend the scaffold toward
  approval-limit logic until that's settled.
- Chart of accounts numbering/coding scheme — **confirmed as a
  requirement 2026-09-10** ("define coding in a way to create space for
  future expansion"), but no actual scheme has been provided or proposed
  yet.
- "Party Form" for report classification — **confirmed as the basis for
  report classification 2026-09-10**, but the reports list itself is
  still not final ("bear with me for reports" — CLAUDE.md section 8).
- Document-number collision risk across simultaneously-offline terminals
  (see UUIDv7 entry above).
