# DECISIONS.md — Kayani Autos / Kiyan Traders Business Management System

Log of individual decisions with rationale. `CLAUDE.md` holds the current-state
summary; this file holds the history and the "why." Newest entries at the top.

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

- Exact relationship between the Markers/Items form and the Control Part
  form (`src/db/schema/inventory.ts`).
- Whether "parent/child linking" in the inventory structure applies at the
  Control Part level (as modeled), the Item level, or across all three.
- Whether a user can hold more than one role at once (`user_roles` modeled
  as many-to-many to avoid foreclosing either answer).
- **Authority Levels module** — flagged in CLAUDE.md as needing its own
  requirements conversation. The RBAC scaffold built in this pass
  (`roles` / `permissions` / `role_permissions`) is being treated as a
  *different* concept from Authority Levels (basic access control vs. what
  we're assuming is approval/spending-limit tiers). Not confirmed — if
  they turn out to be the same thing, this schema needs revisiting.
- Chart of accounts numbering/coding scheme ("expansion-ready" per the
  client, but no scheme was provided).
- "Party Form" for report classification — no details exist yet; not built.
- Document-number collision risk across simultaneously-offline terminals
  (see UUIDv7 entry above).
