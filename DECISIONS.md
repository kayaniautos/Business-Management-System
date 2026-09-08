# DECISIONS.md — Kayani Autos / Kiyan Traders Business Management System

Log of individual decisions with rationale. `CLAUDE.md` holds the current-state
summary; this file holds the history and the "why." Newest entries at the top.

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
