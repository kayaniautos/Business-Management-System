# CLAUDE.md — Kayani Autos / Kiyan Traders Business Management System

This file is the source of truth for project context across sessions and across the two Claude accounts working on this build (planning account and this implementation account). Keep it updated as decisions are made. Log individual decisions with rationale in `DECISIONS.md`; keep this file as the current-state summary.

---

## 1. Project Overview

We are building a custom offline-first ERP system covering POS, inventory management, and accounting for an auto parts business operating in Gawalmandi, Rawalpindi, Pakistan.

The business operates as **two separate legal entities sharing one roof and one physical inventory pool**:

- **Kiyan Traders** — GST-registered, FBR POS integrated
- **Kiyani Autos** — retail, trades as **"Kiyani Auto Toyota"** on its logo/signage (confirmed via logo file, 2026-09-07 — not previously captured; not necessarily a formal Toyota dealership affiliation, just the trading name in use)

Each entity requires **separate books** despite sharing inventory. This is one of the central design challenges of the system.

**Brand assets (confirmed 2026-09-07):** both entities have real logos, provided by the client — `Kiyan Traders Logo.png` and `Kiyani Auto Logo.png` in the `Kayani Autos` folder alongside this repo (not committed to the repo itself; source files, not app assets yet). Both are a black/red gear mark with a bold KT / KA monogram. Use these on every document and screen that shows a company identity — do not invent a placeholder wordmark/icon going forward (the first UI concept pass did, before these existed; already corrected there).

**Business contact info for invoices/documents (confirmed 2026-09-07):**
- Address: Kiyani Auto Market, Gawalmandi Road, Rawalpindi
- Phone: 051-5552489 / 5530887, 0339-4007532
- Email: kiyantraderstoyotta@gmail.com (the business's own public contact address — distinct from the neutral `dev.kayaniautos@gmail.com` handover account used for infra in section 3)

This needs to appear on printed invoices/receipts/documents once those screens exist (they don't yet). Whether it's per-entity (each entity's own line) or shared (one set of contact info for both) is `[unclear — confirm]` — client gave one address/phone/email, not two.

**Primary client contact:** Ghaus Kayani

**Developer / consultant:** Mehmoon, PLYXIO

---

## 2. Core Constraints (drive all design decisions)

1. **Offline resilience** — the system must remain fully operational during internet outages. This is not a nice-to-have; it's the reason the client chose the Local + Cloud architecture package over a cloud-only option.
2. **FBR compliance (SRO 288/2026)** — requires 24-hour offline invoice queuing via a dedicated `fbr_queue` table with a retry worker that pushes queued invoices once connectivity returns.
3. **Multi-entity accounting** — two legal entities, separate books, shared physical inventory. Entity differentiation is **not** structurally embedded in most of the schema — see Chart of Accounts below.
4. **Non-technical users** — UI must be simple. All client-facing content (screens, labels, messages) uses plain Pakistani business English: no jargon, no AI-sounding phrasing, no em dashes.

---

## 3. Confirmed Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Terminal (desktop app) | Electron + React | Runs at the counter/shop |
| Backend | Node.js / TypeScript | |
| Local DB | PostgreSQL | Source of truth, not SQLite — chosen for concurrent multi-terminal writes |
| Cloud sync | Supabase | Via outbox pattern |
| ORM | **Drizzle** (confirmed over Prisma) | No bundled binary query engine → clean Electron packaging. Raw-SQL control needed for LIFO costing logic. Lighter runtime, better fit for the background sync worker. See `DECISIONS.md`. |
| Remote dashboard | React on Vercel | |
| Sync strategy | Background worker | Pushes local PostgreSQL → Supabase when online, outbox pattern |

**Package:** Local + Cloud architecture (advance payment received, timeline officially active). This is a PKR 350K premium over the cloud-only package, justified by internet-outage business risk, not technical architecture, when discussed with the client.

**Infrastructure:** neutral client-branded account stack (Gmail, GitHub, Supabase, Vercel, separate Claude account) for clean handover at project end. This repo lives under that stack.

### 3.1 Data Conventions (confirmed 2026-09-07, see `DECISIONS.md`)

- **Primary keys:** UUIDv7 on every table, generated app-side via the
  `uuidv7` package (not a Postgres-side default). Never printed on documents
  or sent to FBR.
- **Human-facing document numbers:** a separate sequential number per legal
  entity + document type (`document_number_counters` table), independent of
  the UUID PK. Collision risk across simultaneously-offline terminals is an
  open question — see `DECISIONS.md`.
- **Money:** `numeric(14,2)` in whole rupees, not integer paisa.
- **Audit columns:** `created_at`/`updated_at` on every table;
  `created_by`/`updated_by` (nullable FK to `users.id`) on every table too.

---

## 4. Confirmed Phase 1 Discovery Findings

### 4.1 User Roles
Five roles confirmed, with **admin-editable permissions at runtime** — do not hardcode role logic.

- Counter Control
- Corporate Control
- Receipts/Payments Control
- Inventory Control
- Management Control

### 4.2 Inventory Structure
Three-step structure, confirmed:

**Markers Control Form → Item Creation Form → Control Part Number**, with parent/child linking.

`[unclear — confirm]` Exact relationship between the Items/Markers Control Form and the Control Part Form is not yet fully specified. Do not resolve silently — flag and confirm with client before finalizing schema for this piece.

### 4.3 Parts ↔ Car Models
**Many-to-many.** One part fits multiple car models. This is flagged as critical for schema design — do not model as one-to-many.

### 4.4 Chart of Accounts

Single **flat structure** despite two legal entities. Entity differentiation exists **only at the bank account level**. This means multi-entity accounting logic must largely be handled at the **application layer**, not as a hard `entity_id` split baked structurally into every table.

Full structure as provided by client:

**Non-Current Assets**
- Shop at Cost
- Vehicles at Cost
- Software/Computer/Hardware

**Current Assets**
- Parts Inventory Stock
- Parts Sold but not Invoiced Yet (un-invoiced delivery challans — aligns conceptually with offline/FBR invoice queuing behavior)
- Security Deposits
- Income Tax Withheld
- GST Withheld
- Customer Receivable
- Cash in Hand
- Easypaisa
- Jazz Cash
- Bank accounts (5, entity-tagged):
  - AFL1 Kiyan Traders Others 3390
  - AFL2 Kiyan Traders AGPR 8726
  - AFL Kiyani Autos 2478
  - AFL Kiyani Autos 8727
  - FBL Kiyani Autos 5050

**Equity & Reserves**
- Acquisition Cost
- Retained Earnings
- Drawings

**Current Liabilities**
- Supplier Payable
- AFL Short Term Loan

**Income/(Loss)**
- Sale Income net of returns
- Other Income
- Cost of Goods Sold net of returns (**LIFO basis**)
- Freight & Transportation Cost
- Discount Expense Net
- Business Expense
- Stock Adjustment Net
- Salaries & Wages
- Telephone/Electricity/Water Expense
- Kitchen Expense
- Miscellaneous Expense

**Design notes:**
- LIFO costing for COGS must be **deliberately built** into the inventory engine — this is not a default behavior in most ORMs or standard inventory schemas.
- Chart of accounts coding should be expansion-ready.
- Report classification should be based on a Party Form.

---

## 5. Build Phases & Payment

Eight build phases total, four payment milestones tied to phases. Payment/negotiation specifics are excluded from project documentation per Mehmoon's request — do not log commercial terms here.

**Current phase:** Phase 1 — discovery wrap-up, UI/UX design and prototype, workflow review.

Phase 1 discovery blockers have been cleared with the client. Remaining Phase 1 work:
- Schema/scaffolding for confirmed structures — **first pass done** (`src/db/schema/`): users/roles/permissions (RBAC only, not Authority Levels — see open questions), three-step inventory structure, parts↔car-models many-to-many, flat chart of accounts (seeded), first-pass `fbr_queue`. No invoices, ledger, or LIFO cost-layer tables yet — out of scope for this pass.
- UI screen lock-in — **AnyDesk review of the client's current system is done, blocker cleared (2026-09-07).** An exploratory style-direction pass (glassmorphism-influenced, high-contrast/large-touch-target for blue-collar staff) with 3 key screens (staff PIN login, POS counter, inventory) has been drafted for reaction: https://claude.ai/code/artifact/ba934bdb-69f8-4233-a70a-c6c26412aeaf — not yet locked in as final, no client feedback incorporated yet, not committed to this repo (mockup only, not app code).
- Remaining open questions are deferred to the phase that needs them, not resolved early

---

## 6. Open Questions (tracked, not yet resolved)

Do not resolve these silently in code. Flag with `[unclear — confirm]` and raise with the client at the appropriate phase.

- Exact relationship between Items/Markers Control Form and Control Part Form
- Whether "parent/child linking" in the inventory structure applies at the Control Part level, the Item level, or across all three (first-pass schema modeled it at Control Part level only)
- Whether a user can hold more than one role at once, or exactly one (first-pass schema modeled `user_roles` as many-to-many so it doesn't foreclose either answer)
- Full scope of the **Authority Levels module** — requires its own dedicated requirements conversation before any schema work touches it. Do not build this yet. (First-pass schema built a basic roles/permissions RBAC scaffold per 4.1, treated as a *different* concept from Authority Levels — not confirmed.)
- Chart of accounts numbering/coding scheme ("expansion-ready" per the client, but no scheme provided yet)
- "Party Form" for report classification — no details exist yet
- How sequential document numbers (invoice/receipt) avoid collisions across multiple terminals offline at the same time for the same legal entity
- Employee code linking for reports
- Exact business definitions of RPP and SAP
- Whether the client's Reports list is final (client notes end with "Details to be continued")
- Whether printed invoices/documents show one shared address/phone/email for both entities, or the same contact info repeated per entity (client provided one set, covering both)

---

## 7. Key Principles

- **Source fidelity over polish.** Documentation must reflect the client's handwritten notes faithfully. Ambiguities are flagged inline with `[unclear — confirm]`, never resolved silently.
- **LIFO must be deliberate.** Build it explicitly into the inventory engine.
- **Entity separation lives at the bank level.** The chart of accounts is otherwise flat. Multi-entity logic is an application-layer concern.
- **Scope trimming over underpricing.** If the client pushes back on cost, trim scope rather than reduce price.
- **Claude's involvement stays invisible to the client.** Neutral naming conventions throughout; the client has no access to any Claude account.

---

## 8. Known Environment Gotchas

- Free-tier Vercel and Supabase are **unsuitable** for this project: Vercel Hobby prohibits commercial use; Supabase free tier auto-pauses after 7 days and has insufficient storage. Provision paid tiers.
- Hugging Face model downloads are blocked in sandboxed dev environments used for planning (network allowlist doesn't cover huggingface.co) — not relevant to production but worth knowing if transcription/ML tooling comes up during planning sessions.
- **Local dev PostgreSQL (2026-09-07):** PostgreSQL 17 is installed on Mehmoon's dev machine (Windows service `postgresql-x64-17`, port 5432, superuser `postgres`/`postgres` — matches `.env.example`, dev-only). Database `kayani_autos` exists. The schema in `src/db/schema/` has been applied for real (`npm run db:migrate`) and seeded (`npm run db:seed`, confirmed idempotent on re-run) — not just generated as SQL. Spot-checked: chart-of-accounts entity tagging is null everywhere except the 5 bank rows (confirms the section 3.1/4.4 design actually holds in data, not just intent); markers→items→control_parts inserts, the parent/child self-reference, the parts↔car-models join, and FK rejection of bad references all verified working end to end.

---

## 9. Working Agreement

- This repo (`CLAUDE.md` + `DECISIONS.md`) is the shared source of truth between the planning-account Claude and this implementation-account Claude Code. Keep both updated as work progresses, so decisions don't drift between sessions.
- Ask before making any schema or architecture decision not already confirmed in this file.
- Client-facing copy (labels, messages, error text) must be plain Pakistani business English — no jargon, no AI-sounding phrasing, no em dashes.
