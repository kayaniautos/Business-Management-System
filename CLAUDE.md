# CLAUDE.md — Kayani Autos / Kiyan Traders Business Management System

This file is the source of truth for project context across sessions and across the two Claude accounts working on this build (planning account and this implementation account). Keep it updated as decisions are made. Log individual decisions with rationale in `DECISIONS.md`; keep this file as the current-state summary.

**Full field-level source material lives in `docs/planning/`** — imported 2026-09-08 from the planning-account Claude Project (see DECISIONS.md for the import event). Read those files before doing schema work on any module not yet summarized in detail below:
- `docs/planning/kayani-erp-project-handover.md` — the primary handover doc: full data model (Forms A–G, field-by-field), sales document chain, vouchers, reports, system-wide conventions, glossary, non-functional requirements, the 14-item open-questions checklist, build phases/timeline.
- `docs/planning/kayani-erp-full-export.md` — chat-only context not written into any saved file, plus explicitly flagged version conflicts (see section 6 below).

This file summarizes and reconciles those with what's actually been built in this repo. Where the two disagree, this file flags it — it does not silently pick one.

---

## 1. Project Overview

We are building a custom offline-first ERP system covering POS, inventory management, and accounting for an auto parts business operating in Gawalmandi, Rawalpindi, Pakistan.

**Consultant/developer:** Mehmoon, operating under **PLYXIO** (info@plyxio.com, +1 646 222 3911). Acting as both the consultant who scoped/sold the project and the developer building it, with Claude assisting throughout.

**Primary client contact:** Ghaus Kayani — communicates over **WhatsApp**, terse and businesslike in tone. Can read as anxious/demanding at times; generally anxiety-driven rather than scope escalation, not a sign of a difficult client. Prefers to review/adjust before committing to anything (e.g. "I'll get back to you tomorrow" rather than responding under pressure) — don't expect fast sign-off on open questions.

The business operates as **two separate legal entities sharing one roof and one physical inventory pool**:

- **Kiyan Traders (KT)** — corporate entity, GST-registered, FBR POS integrated on **3 confirmed workstations**.
- **Kiyani Autos (KA)** — retail entity, trades as **"Kiyani Auto Toyota"** on its logo/signage (confirmed via logo file, 2026-09-07 — not necessarily a formal Toyota dealership affiliation, just the trading name in use). No FBR integration.

The completed ERP will be **owned by Kiyan Traders**, though Kiyani Autos is equally served by it — keep wording entity-neutral where it matters.

Each entity requires **separate books** despite sharing inventory. This is one of the central design challenges of the system.

**Staff profile:** counter staff are non-technical, blue-collar workers. Hard UX constraint — large touch targets, minimal typing, barcode/scan-friendly, clear error states, fast counter operation, function-key search shortcuts (see section 5.9).

**Central business risk:** internet connectivity in the client's area is unreliable. The system must keep billing, selling, and tracking stock during outages of hours to days, with no data loss and no double-selling of stock across counters. This is *why* the client is paying for the more sophisticated Local + Cloud architecture instead of a plain cloud web app — not a nice-to-have.

**Brand assets (confirmed 2026-09-07):** both entities have real logos, provided by the client — `Kiyan Traders Logo.png` and `Kiyani Auto Logo.png` in the `Kayani Autos` folder alongside this repo (not committed to the repo itself; source files, not app assets yet). Both are a black/red gear mark with a bold KT / KA monogram. Use these on every document and screen that shows a company identity — do not invent a placeholder wordmark/icon (the first UI concept pass did, before these existed; already corrected there).

**Business contact info for invoices/documents (confirmed 2026-09-07):**
- Address: Kiyani Auto Market, Gawalmandi Road, Rawalpindi
- Phone: 051-5552489 / 5530887, 0339-4007532
- Email: kiyantraderstoyotta@gmail.com (the business's own public contact address — distinct from the neutral `dev.kayaniautos@gmail.com` handover account used for infra, section 3)

Whether printed documents show this once (shared) or repeated per entity is `[unclear — confirm]` — client gave one set, covering both.

---

## 2. Core Constraints (drive all design decisions)

1. **Offline resilience** — the system must remain fully operational during internet outages of hours to days. Not a nice-to-have; it's the reason the client chose Local + Cloud over cloud-only.
2. **No data loss / no double-sell** — multi-terminal offline operation must not allow two counters to oversell the same stock unit without reconciliation.
3. **FBR compliance (SRO 288/2026)** — requires 24-hour offline invoice queuing via a dedicated `fbr_queue` table with its own retry worker, decoupled from general cloud sync. FBR submission must not be blocked/delayed by unrelated sync traffic; needs its own status tracking (queued → submitted → acknowledged/failed) with alerting if the 24-hour window is at risk. FBR API sandbox access requires **client-side registration** — a client dependency, not something Mehmoon can unblock alone.
4. **Multi-entity accounting** — two legal entities, separate books, shared physical inventory. The client-provided chart of accounts is flat/unsplit except at the bank-account-name level — entity separation is **not** structurally embedded in the schema; it's an application-layer concern (see section 4).
5. **Non-technical users** — UI must be simple. All client-facing content (screens, labels, messages) uses plain Pakistani business English: no jargon, no AI-sounding phrasing, no em dashes.
6. **Auditability** — post/unpost states, mandatory adjustment comments, margin-override logging, clean transaction history are explicit client requirements, not an afterthought (see section 5.9).

---

## 3. Confirmed Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Terminal (desktop app) | Electron + React | Chosen over browser-based approaches for native hardware access (receipt printers, barcode scanners, cash drawers) |
| Backend | Node.js / TypeScript, **Fastify** (confirmed over Express, 2026-09-09) | Built-in Zod-based request validation with type inference pays off repeatedly across this form-heavy app (Forms A-G); leaner core matches the same "lighter runtime" reasoning already used to pick Drizzle over Prisma. See `DECISIONS.md`. |
| Local DB | PostgreSQL | Source of truth, not SQLite — chosen for concurrent multi-terminal writes |
| Cloud sync | Supabase | Via outbox pattern (local Postgres is the single source of truth; a background worker pushes to Supabase when online) |
| ORM | **Drizzle** (confirmed over Prisma) | No bundled binary query engine → clean Electron packaging. Raw-SQL control needed for LIFO costing logic. Lighter runtime, better fit for the background sync worker. See `DECISIONS.md`. |
| Remote dashboard | React on Vercel | Read-only, for the owner to check the business remotely |
| Sync strategy | Background worker | Outbox pattern, pushes local PostgreSQL → Supabase when online |

`[unclear — confirm]` **Open architecture question:** should in-shop terminals run a unified Electron setup (one terminal doubling as local server), or a dedicated always-on server process separate from any terminal UI? Needs a decision before local-server implementation starts.

**Package:** Local + Cloud architecture (advance payment received, timeline officially active). This is a PKR 350K premium over the cloud-only package, justified by internet-outage business risk, not technical architecture, when discussed with the client. Do not log further commercial/pricing terms in this file per Mehmoon's request.

**Infrastructure cost budget:** free tiers are **not viable** — Vercel Hobby prohibits commercial use; Supabase free tier auto-pauses after 7 days of inactivity (incompatible with the local-server-plus-cloud-mirror pattern), its 500MB cap is too small, and it has no backups (unacceptable for a compliance-sensitive system). Recommended: Vercel Pro (~$20/mo) + Supabase Pro (~$25–35/mo) ≈ **$45–55/month**, to be presented to the client as a transparent infra line item.

**Infrastructure identity:** neutral client-branded account stack (Gmail, GitHub, Supabase, Vercel, separate Claude account) for clean handover at project end — password reset, not account/repo transfers. Keeps AI-tool usage invisible to the client if they ever review project assets. This repo lives under that stack.

### 3.1 Data Conventions (confirmed 2026-09-07, see `DECISIONS.md`)

- **Primary keys:** UUIDv7 on every table, generated app-side via the `uuidv7` package (not a Postgres-side default). Never printed on documents or sent to FBR.
- **Human-facing document numbers:** a separate sequential number per legal entity + document type (`document_number_counters` table), independent of the UUID PK. Collision risk across simultaneously-offline terminals is an open question — see `DECISIONS.md`.
- **Money:** `numeric(14,2)` in whole rupees, not integer paisa.
- **Audit columns:** `created_at`/`updated_at` on every table; `created_by`/`updated_by` (nullable FK to `users.id`) on every table too.

---

## 4. Chart of Accounts — TWO unreconciled versions exist (was three)

`[unclear — confirm]` **Do not treat either version below as authoritative without asking the client** — but this repo's schema is no longer a third, independent version; it's been updated (2026-09-08) to exactly match version 2.

1. **A memory-held earlier version** (planning-account chat memory, source/date unknown) — has "Softwares/Computer & Hardware," "Income Tax Withheld"/"GST Withheld" under *Current Assets*, and lacks everything unique to version 2 below.
2. **The 2026-09-07 client spreadsheet version** (`docs/planning/kayani-erp-full-export.md` section 2, sourced from `chart of accounts.xlsx`) — has "ERP, Computer & Hardware" instead, moves the Withheld/Payable accounts to *Income/(Loss)* marked status-of-party-wise, and adds "JS Kiyan Traders" (bank account), LPP provision accounts (in two different sections), "Income Tax Payable"/"GST Payable" under *Equity & Reserves* (a **confirmed** duplicate-looking pair alongside the Income/(Loss)-section Withheld/Payable accounts — verified present in the real file, not a transcription error; still flag to client, don't assume it's intentional), and "Travelling Expense Account." **Directly verified against the actual spreadsheet cell-by-cell 2026-09-08** — exact match, strongest provenance since it's a real client file, not a relayed summary.

**This repo's schema and seed data now match version 2 exactly** (`src/db/schema/accounts.ts`, `src/db/seed.ts`, updated and re-verified against the live local database 2026-09-08): all 29 line items with verbatim wording (including the client's own apparent typo "Cost of Good Sold," singular — preserved rather than silently "corrected," since matching the source file was the point), the 6th bank account ("JS Kiyan Traders," entity-tagged to Kiyan Traders), and a new nullable `note` column on `chart_of_accounts` carrying the four party-wise/LIFO annotations verbatim. Structurally unchanged and still correct regardless of which COA content-version ultimately wins: single flat table, entity differentiation **only** at the bank-account level (now 6 rows tagged with `legal_entity_id`, every other row `null`).

**What remains open:** whether the client wants version 1's differences reinstated (unlikely, since version 2 is both more recent and directly file-verified) or whether version 2 itself needs correcting (e.g. the possible tax-payable duplication). Confirm with Ghaus before treating version 2 as permanently final — "directly verified" means the transcription is accurate, not that the client has signed off on it as the design to build the rest of the system against.

**Design notes (apply regardless of which version is confirmed):**
- LIFO costing for COGS must be **deliberately built** into the inventory engine — not a default behavior in most ORMs or standard inventory schemas.
- Chart of accounts coding should be expansion-ready — no numbering scheme has been provided yet.
- Report classification should be based on the **Party Form** (section 5.5) — Status (C1/C2/C3) and Nature (S1/S2/S3) codes, in addition to per-entity (KA/KT) split.

---

## 5. Full Data Model (from client's own handwritten planning notes)

*Full field-level detail for all of this is in `docs/planning/kayani-erp-project-handover.md` section 7 — this is a summary with pointers, not a replacement. Treat the handover doc as closer to source-of-truth than this summary for these specific modules; it's a direct transcription of the client's own notes, not a paraphrase of a paraphrase.*

### 5.1 Item Form (Form "A") — the base sellable/stockable unit
Lettered fields a–i: Item Code (auto-generated, **explicitly noted as a future barcode candidate** — design the code format with barcode-symbology compatibility in mind), Part No, Brand, Origin (no duplicates), Class, Engine Info, Model, Size, Control Part No. (a lookup into Form B, not free text). Plus system fields: RPP, SAP (see Glossary, section 5.11), Safety Stock Days (feeds Stock Ordering, 5.6), Print Name (auto-composed as `Class + Part No + Brand`, editable — see the Print Name pattern in 5.9).

### 5.2 Items/Markers Control Form (Form "1A") — distinct from Control Part Form
`[unclear — confirm]` **This repo's current schema (`src/db/schema/inventory.ts`: `markers` → `items` → `control_parts`) is a simplified first-pass reading of this — it predates having the client's actual field-level notes and does not yet reflect Form A's lettered fields, RPP/SAP, Print Name, or Safety Stock Days.** Per the client's own notes, Form 1A governs fields a)–h) of Form A (everything except Control Part No., which is its own lookup into Form B) — essentially the master-data/dropdown-management screen for Item Code, Part No, Brand, Origin, Class, Engine Info, Model, Size. The client's own notes flag confusion between 1A and Form B and mark it as needing discussion — do not merge them in the schema without confirming. Before finalizing the inventory schema: walk the client through a concrete example to settle whether 1A is a generic "manage all dropdown lists" admin screen or specifically about Control Part sub-fields.

### 5.3 Control Part Form (Form "B") — vehicle fitment/compatibility record
Fields under "Control Part Number": Model name, Frame/Engine name, Year From, Year To, Engine capacity/CC, Transmission, Engine Fuel. **One Control Part can have 10–15 fitment lines** (client's own estimate) — design the fitment child table for this volume as the norm, not the edge case. The Control Part ↔ Item attachment is **explicitly manual**, not inferred. Searching any one Item should surface all Items sharing its Control Part Number (cross-variant visibility, e.g. "Original"/"Japan"/"Thailand" variants of the same functional part).

`[unclear — confirm]` This repo's `car_models` table (`make`, `model`, `yearFrom`, `yearTo`) is missing Frame/Engine name, Engine capacity/CC, Transmission, and Engine Fuel from the actual spec above — a real gap, not just a naming difference, if the parts↔car-models join is meant to carry Form B's full fitment detail.

### 5.4 Deal Part Form (Form "C") — bundling layer, not built yet
Two or more Items combined under a manually-named bundle (**Print Name is manually typed, unlike Form A's auto-composed one** — don't reuse the same print-name logic between the two). The bundle itself never holds stock — a Deal Part sale posts stock movement against the underlying Items. Pricing (RPP/SAP/sale price) is decided at time of sale, not cached on the Deal Part definition; the system must keep a full price record per transaction since of this.

### 5.5 Party Form (Form "D") — customers & vendors — **first pass built 2026-09-08**
Fields: Name, GST No, NTN No, 1–5 phone numbers, **Status of Party** (`C1` Corporate / `C2` Retail-Counter / `C3` Wholesale — client's notes show "O2," almost certainly a slip for "C2"), **Nature of Party** (`S1` Vendors/Suppliers A/C / `S2` Market Supplier A/C / `S3` Customer Receivable A/C), Print Name (defaults to Name, editable). Status and Nature are **two independent classification axes** — every Party needs both. Drives pricing tier, discount display, and which ledger account family a party posts against.

Built as `parties` (Status/Nature modeled as enums, same reasoning as `account_category` — see section 4) and a child `party_phone_numbers` table (`src/db/schema/parties.ts`). The 1–5 phone number cap is enforced at the application layer, not the database. Status uses `C1`/`C2`/`C3` per the confirmed reading of the notes — `[unclear — confirm]` if the client actually meant something by "O2" literally. Validated end to end against the local database: inserts, multiple phones per party, and enum rejection of an invalid status code all confirmed working. Not yet linked to anything — chart-of-accounts party-wise reporting, Sales documents, and Customer/Supplier ledgers all still need to reference this table once they're built.

### 5.6 Stock Ordering Module (Form "E") — not built yet
Reorder suggestions based on Safety Stock Days (Form A). On-demand report generation. Can feed directly into a purchase order (add ordered qty + supplier + price from this screen). Client's notes mark this "Detail Discussed" — worth a follow-up to recover the fuller detail behind the shorthand.

### 5.7 Stock Adjustment Form (Form "F") — not built yet
Pick Item Code → system shows current qty → staff enters +/- adjustment qty → **mandatory, detailed comment** (audit trail for shrinkage/damage/recount) → on posting, SAP is adjusted as a consequence. Also marked "Detailed Discussion" in client's notes.

### 5.8 Authority Levels / Form (Form "G") — the least-specified module, do not build schema for this yet

`[unclear — confirm]` **This repo's RBAC scaffold (`src/db/schema/users.ts`: `roles`/`permissions`/`role_permissions`) was built and seeded treating "five roles" as confirmed. Per the actual planning history, that overstates where things stand — see section 6 below.** Do not extend this scaffold toward approval-limit/authority logic until the scoping conversation below is finished with the client.

Confirmed so far: scope is **global** (one role model across both KT and KA, not per-entity); controls **both** approval authority (who can authorize actions) and access control (who can see/use what).

Still needs client input: (1) who are the actual people/roles today, by name and real responsibility, not abstract titles; (2) what needs sign-off *before* it happens vs. (3) what only needs after-the-fact visibility; (4) who can see margin/cost data vs. just sale price; (5) does authority enforcement need to work offline, and can a cashier bypass something while disconnected.

Two candidate role structures exist, **neither confirmed by the client**:
- **Three-tier** (the original starting proposal): Owner/Admin (everything, sees cost/margin) / Manager (approves discounts/refunds/voids, sees margin) / Cashier/Staff (sales entry only, no discount/refund without approval, no cost visibility).
- **Five-role** (discussed as an alternative, and the one this repo's schema/seed data currently uses): Counter Control / Corporate Control / Receipts/Payments Control / Inventory Control / Management Control.

Regardless of which is confirmed: **do not hardcode role names or a fixed role count in the schema** — the admin must be able to create arbitrary roles at runtime. This constraint is why `roles`/`permissions` are tables, not enums.

### 5.9 System-wide conventions (apply everywhere, not just one form)
- **CAPS language** for system text/labels — scope unconfirmed (`[unclear — confirm]`), likely printed documents and key labels rather than every UI microcopy string.
- **Editable/New pattern**: nearly every form supports create and edit through the same interface, not separate screens.
- **Post/Unpost pattern**: applies to all transactional documents except the Quotation (informational only, zero accounting impact). Posting finalizes a document's stock/accounting effect; unposting reverses it for correction.
- **F1–F9 function-key search shortcuts**: referenced repeatedly across forms — build one shared, reusable search/lookup component, not one-off implementations per form.
- **Print Name pattern**: system-composed with an editable on-screen override; whatever's in the field at save time is what prints. Uniform across Quotation/DN/Invoice (Deal Part and Party Form each have their own variant — see 5.4/5.5).
- **Gross-price-entry pattern**: staff enter the gross price; the system computes the tax breakdown. True across Quotation, DN, and Invoice.
- **Manual line sequencing/serial numbering** for print, identical across Quotation/DN/Sales Invoice.
- **Branding**: both entities' logos plus one shared address must appear on ledgers/printed documents (see section 1).

### 5.10 Sales document chain — **first pass built 2026-09-09**
**Quotation → Delivery Note (DN) → Proforma Sales Tax Invoice / Sales Tax Invoice.** Any step can also be created directly (a DN doesn't require a Quotation first; an Invoice doesn't require a DN first). An Invoice can draw from one DN or several combined, including merging the same item across multiple DNs onto one invoice line. Two print formats for Invoice (Invoice format / Bill format for sales tax) — same underlying document. DN has 4 format variants (KA/KT × with-price/without-price).

Built as one shared `sales_documents` header table (a `document_type` discriminator: quotation/delivery_note/invoice) rather than three separate tables, since the three share almost every field and the client's own notes ask for identical line-sequencing/Print-Name behavior across them (`src/db/schema/sales-documents.ts`). The document chain itself (`sales_document_links`) is many-to-many, not a single "previous document" column, specifically to support an Invoice merging lines from several DNs. Line items (`sales_document_lines`) carry the per-invoice Print Name override (`displayName`, falls back to the catalog name) and a manually-editable `lineNumber` for print sequencing. Discount lines are a separate `sales_document_discounts` table, not a line-item flag — the "Kiyani Autos only, max 2" rules are enforced at the application layer, same pattern as `party_phone_numbers`' 1–5 cap.

**Deliberately not built in this pass** (see the file's own header comment for the full reasoning): settlement channels/payments — CLAUDE.md's own phase table scopes those to Phase 4, not Phase 2, and building them now risks conflicting with the not-yet-designed Vouchers module; margin alerts/override logging — needs a cost figure from the LIFO engine, which doesn't exist yet; actual tax computation — the columns to hold a computed breakdown exist (`lineTaxAmount`, `taxTotal`), but no tax rule engine is built.

`[unclear — confirm]` "Proforma Sales Tax Invoice" vs "Sales Tax Invoice," and "Invoice format" vs "Bill format," are both modeled as print-time labeling of the *same* invoice record, not separate documents — nothing in the spec suggests either pair has a different stock/accounting effect. If that's wrong, invoice needs to split into two document types.

Validated end to end against the local database: a full Quotation → DN → Invoice chain (via `sales_document_links`), a per-invoice renamed line resolving correctly alongside its unchanged catalog name, a discount line dropping the invoice total from Rs 900 to Rs 700, and FK rejection of a bad `control_part_id` — all inside a rolled-back transaction, no data left behind.

**Discount handling by entity — RESOLVED 2026-09-08, corroborated by two independent sources:** itemized discount line(s) for **Kiyani Autos only**; **Kiyan Traders** uses net-of-discount pricing baked into the price, no separate discount line. This matches both the historical planning notes (`docs/planning/kayani-erp-project-handover.md` section 6.1) and Ghaus Kayani's live feedback on the UI concept ("which sometimes happens just at Kiyani Auto"). Supersedes the open question in the previous version of this file. **Follow-up needed:** the current POS mockup shows the itemized discount UI generically without gating it by entity — needs updating once the mockup is touched again.

- **Credit vs. cash**: KT corporate customers can buy on credit, settled invoice-wise; KA retail is always cash at point of sale.
- **Settlement channels**: Cash, EasyPaisa, JazzCash, Bank Transfer, each posting to its own chart-of-accounts account. `[unclear — confirm]` whether a single sale can split across multiple channels.
- **Margin alert**: soft warning (not a hard block) when a line's margin falls outside a configured band; posted lines outside the band get a persistent highlight in reports/history; a margin-override log report should exist. `[unclear — confirm]` whether the margin band is per-category, per-item, or one global limit, and whether an override needs admin approval or just a click-through.
- **Per-invoice item name override** (already captured pre-import, still holds): staff can rename how an item prints on one invoice without touching the catalog name — this is the same mechanism as the Print Name pattern (5.9) applied at the line-item level.

### 5.11 Glossary
| Term | Meaning |
|---|---|
| DN | Delivery Note |
| RPP | Reference/Retail Purchase Price, auto-populated on Form A — exact business definition still needs confirming |
| SAP | A sale-price reference field auto-populated on Form A, adjusted on posting a Stock Adjustment — **not** related to the ERP vendor SAP — exact business definition still needs confirming |
| KT / KA | Kiyan Traders / Kiyani Autos |
| Control Part | The canonical fitment record (Form B) grouping all origin-variants of functionally the same part |
| Deal Part | A sales-time bundle (Form C) of 2+ items sold/printed under one manually-set name |
| Post/Unpost | Document state controlling whether a transaction has taken its final stock/accounting effect |
| F1–F9 | Function-key shortcuts for search/lookup panels, referenced throughout |
| Search layout N | The client's own numbering for named search/query modes on a given form (see handover doc §7 for the specific layouts) |

---

## 6. Roles / Authority Levels — status correction (2026-09-08)

The previous version of this file stated "five roles confirmed" for section 5.8 above. Reconciling against the full planning history (`docs/planning/kayani-erp-full-export.md` section 4.3) shows this overstated things: the five-role list was one of **two candidates discussed with the client, neither actually confirmed**. This repo's RBAC schema and seed data (`src/db/schema/users.ts`, `src/db/seed.ts`) already went ahead and seeded the five-role list as `is_system: true` rows, as if settled.

**This is not being unwound right now** (the seed data is harmless placeholder data, not load-bearing for anything built so far), but: **do not build anything further on top of the assumption that these five roles are final**, and raise this explicitly with the client alongside the Authority Levels scoping conversation (section 5.8) — including confirming whether "Authority Levels" and this basic RBAC scaffold are even the same concept, which was already flagged as a separate open question before this import.

---

## 7. Purchasing, Delivery & Returns (not built yet)
- Goods receipt can happen **before** the supplier invoice arrives, recorded against an internal memo/delivery challan, reconciled later — don't force invoice-first receiving into the schema.
- Supplier returns are a ledger entry linked back to the original purchase voucher, not a free-floating credit note.
- Delivery challans support partial deliveries against one order.
- An invoice can be raised from one challan or several combined — needs a defined UX path for picking line items across multiple challans onto one invoice.

## 8. Vouchers, Ledgers & Reports (not built yet)

Voucher types: Bank/Cash Receipt, Bank/Cash Payment, Journal — each apparently with "two types" the client's notes suggest are Sales Tax / Income Tax variants (`[unclear — confirm]`).

`[unclear — confirm]` **Three non-matching Reports/Vouchers lists exist** across planning sources and are not reconciled anywhere:
1. The handover doc's 13-item report list (`docs/planning/kayani-erp-project-handover.md` section 10) — client's own notes, page 9, ends with "Details to be continued."
2. The 2026-09-07 chart-of-accounts file's 19-item "Reports Needed" list and separate 9-item "Vouchers Needed" list (`docs/planning/kayani-erp-full-export.md` section 2) — more granular, e.g. splits "against invoice" as its own voucher line per type.
3. A shorter original discovery-conversation list (daily sales, stock valuation, receivables ageing, part-wise sales, margin-override log) referenced only in passing in the handover doc.

Do not build the reports module against any one of these as if it were final — confirm with the client which supersedes which, and whether items unique to one list (e.g. "part-wise sales," "margin-override log") fold into a broader category on another list or are still separately required.

---

## 9. Build Phases & Timeline

Eight build phases (target completion **December 2026**). Payment/negotiation specifics are excluded from this file per Mehmoon's request — do not log commercial terms here; durations below are project-planning facts, not pricing.

| Phase | Deliverable | Duration |
|---|---|---|
| 1 | Discovery wrap-up, UI/UX design and prototype, review of existing system workflows | 1–2 weeks |
| 2 | Core build: Sales module (quotations through invoices), Inventory module (catalogue, fitment search, variants) | 5–6 weeks |
| 3 | Purchasing, goods receipt, supplier returns, delivery challans | 2–3 weeks |
| 4 | Accounting: dual chart of accounts, ledgers, settlement channels, journal entries, core reports | 3–4 weeks |
| 5 | FBR POS integration (KT workstations), offline invoice queue | 1–2 weeks |
| 6 | Local server + LAN sync engine, on-site setup | 2–3 weeks, **runs parallel to phases 3–5**, not after |
| 7 | Data migration (post assessment) | Scoped separately, runs parallel once source access is available |
| 8 | UAT, staff training (non-technical/blue-collar-appropriate), go-live support | 1–2 weeks |

**Current phase:** Phase 1. Per the plan, Phase 1 is design/prototype work and does **not** require Authority Levels or the open-questions list fully resolved first. Schema work can proceed on uncontested areas in parallel; hold off specifically on Authority-Levels-dependent tables.

**Phase 1 status:**
- Schema/scaffolding for confirmed structures — **first pass done** (`src/db/schema/`): users/roles/permissions (RBAC scaffold only, see section 6 for its actual confirmation status), three-step inventory structure (see section 5.2/5.3 for gaps against the real field-level spec), parts↔car-models many-to-many (see section 5.3 for missing fitment fields), flat chart of accounts (seeded, matches the verified client spreadsheet — section 4), Party Form (section 5.5), Sales document chain (section 5.10), first-pass `fbr_queue`. Validated against a real local Postgres — see section 13. No ledger, LIFO cost-layer, settlement/payments, or Deal Part tables yet.
- UI screen lock-in — AnyDesk review done, blocker cleared (2026-09-07). An exploratory glassmorphism-influenced style-direction pass with 3 key screens (staff PIN login, POS counter, inventory) is live: https://claude.ai/code/artifact/ba934bdb-69f8-4233-a70a-c6c26412aeaf — through two rounds of client feedback (itemized discount, per-invoice item rename), not yet locked in as final. This is a static, non-interactive mockup — it does not connect to the real backend below.
- Data migration prerequisites unconfirmed: current system (named software vs. Excel), DB access vs. exports only, how much history to migrate, whether KT/KA data is already cleanly separated in the old system.
- **First real, running vertical slice — built 2026-09-09.** Until now, everything above only existed as schema (visible via SQL) or a static mockup (fake data, no logic). This is a genuinely working, if visually unstyled, path: a Fastify API (`src/server/`) with a real login endpoint (bcrypt-checks a PIN against the real `users` table, returns real roles) and a real parts-search endpoint (queries the real seeded `control_parts`/`items`/`markers`/fitment data), plus a minimal React frontend (`web/`) that calls both. Run with `npm run dev` (starts the API on :4000 and the frontend on :5173 together) after `npm run db:seed` and `npm run db:seed:dev` (the latter is local-dev-only sample data — a demo user `asif.raza` / PIN `1234`, two sample oil filters, one car-model fitment link — never confirmed business data). Deliberately not styled to match the design concept above yet — the point of this pass was proving the real data path works end to end, not visual polish.

## 10. Data Migration (scoped and priced separately from the core build, but bundled into project cost, not billed as a separate line item)

Outstanding balances migrate differently by party: Corporate (KT) customers migrate invoice-wise, preserving invoice-level structure; everyone else migrates as a standalone running balance. A short data assessment needs to happen before migration work starts.

---

## 11. Open Questions (tracked, not yet resolved)

Do not resolve these silently in code. Flag with `[unclear — confirm]` and raise with the client at the appropriate phase. The full 14-item checklist with sources is in `docs/planning/kayani-erp-project-handover.md` section 19 — this list is the condensed, prioritized version plus items surfaced since.

**Flagged as active version conflicts — highest priority to settle, since schema work is already touching these areas:**
- Chart of accounts: two non-matching content-versions remain (section 4) — this repo's schema now matches version 2 exactly, but the client hasn't signed off on version 2 itself.
- Reports/Vouchers: three non-matching lists (section 8).
- Authority Levels / roles: two unconfirmed candidate structures, one already seeded into this repo's schema as if settled (sections 5.8, 6).

**Everything else, roughly grouped:**
- Exact relationship between Items/Markers Control Form (1A) and Control Part Form (B) — section 5.2.
- Whether "parent/child linking" in the inventory structure applies at the Control Part level (as currently modeled), the Item level, or all three.
- Whether a user can hold more than one role at once (`user_roles` modeled many-to-many so it doesn't foreclose either answer).
- Employee code linking — how staff attribute to transactions/reports; affects Authority Levels and Reports.
- Exact business definitions of RPP and SAP.
- "Status of Party" codes: client's notes show C1/O2/C3 — near-certainly a slip for C1/C2/C3, treat as a 3-option enum but confirm.
- Whether the client's Reports list is final ("Details to be continued" in their own notes).
- Whether printed documents show shared or per-entity contact info (section 1).
- Whether the linked/complementary item suggestion (e.g. clutch plate + pressure plate) is manual or system-inferred — default assumption is manual, matching how Deal Part works.
- Margin-alert band scope (per-category/per-item/global) and override approval requirement.
- Unified Electron terminal-as-server vs. dedicated always-on server process (section 3).
- Whether a single sale can split across multiple settlement channels.
- Chart of accounts numbering/coding scheme ("expansion-ready," no scheme provided).
- How sequential document numbers avoid collisions across multiple terminals offline at once for the same entity.
- ~~Whether sale discounts are Kiyani Autos-only or both entities~~ — **RESOLVED, see section 5.10.**

---

## 12. Key Principles

- **Source fidelity over polish.** Documentation must reflect the client's actual notes faithfully — go back to source material, not a prior summary of it. The first documentation pass (built from a summary rather than the client's own notes) missed three entire modules (Stock Ordering, Stock Adjustment, Authority Levels). Ambiguities are flagged inline with `[unclear — confirm]`, never resolved silently.
- **LIFO must be deliberate.** Build it explicitly into the inventory engine.
- **Entity separation lives at the application layer.** The chart of accounts is flat except at the bank-account level; do not assume structural KT/KA separation exists anywhere else in the data.
- **Permissions are runtime-configurable.** Do not hardcode role names or a fixed role count anywhere, regardless of which Authority Levels candidate is eventually confirmed.
- **Scope trimming over underpricing.** If the client pushes back on cost, trim scope rather than reduce price.
- **Don't let compliance-critical scope quietly disappear.** FBR integration and offline sync must work end-to-end in the core build phase, never deferred under a "fine-tuning" label.
- **Migration is bundled into the project cost, not a separate billable add-on** — a firm client preference.
- **Claude's involvement stays invisible to the client.** Neutral naming conventions throughout; the client has no access to any Claude account.

---

## 13. Known Environment Gotchas

- Free-tier Vercel and Supabase are **unsuitable** for this project (section 3). Provision paid tiers.
- Hugging Face model downloads are blocked in sandboxed dev environments used for planning (network allowlist doesn't cover huggingface.co) — not relevant to production but worth knowing if transcription/ML tooling comes up during planning sessions.
- The planning-account Claude's `read_conversation`-style tools cannot retrieve image attachments from prior chats, only text summaries written at the time. If image-based source material (e.g. photos of the client's handwritten notes) is needed again, it needs re-uploading into the active conversation.
- **No real Python on Mehmoon's dev machine (2026-09-08)** — `python`/`python3` resolve to the Windows Store install-stub, no `py` launcher either. Spreadsheet reading fell back to a throwaway Node + SheetJS (`xlsx` npm package) script instead of the usual openpyxl/pandas approach. Worth a real Python install if spreadsheet work becomes routine.
- **Local dev PostgreSQL (2026-09-07, updated 2026-09-08):** PostgreSQL 17 is installed on Mehmoon's dev machine (Windows service `postgresql-x64-17`, port 5432, superuser `postgres`/`postgres` — matches `.env.example`, dev-only). Database `kayani_autos` exists. The schema in `src/db/schema/` has been applied for real (`npm run db:migrate`) and seeded (`npm run db:seed`, confirmed idempotent on re-run) — not just generated as SQL. Spot-checked: chart-of-accounts entity tagging is null everywhere except the 6 bank rows (was 5, before the "JS Kiyan Traders" account was added — section 4); markers→items→control_parts inserts, the parent/child self-reference, the parts↔car-models join, and FK rejection of bad references all verified working end to end.

---

## 14. Working Agreement

- This repo (`CLAUDE.md` + `DECISIONS.md` + `docs/planning/`) is the shared source of truth between the planning-account Claude and this implementation-account Claude Code. Keep all three updated as work progresses, so decisions don't drift between sessions or get lost when a Claude Project's chat memory isn't exported.
- Ask before making any schema or architecture decision not already confirmed in this file.
- Client-facing copy (labels, messages, error text) must be plain Pakistani business English — no jargon, no AI-sounding phrasing, no em dashes. Client notes separately specify **CAPS** for system text/labels, scope unconfirmed (section 5.9) — this is about casing, not a contradiction of the "no jargon" rule.
- **Correction-handling convention:** when Mehmoon corrects something, confirm back explicitly what changed vs. what was already there — restate the delta rather than silently accepting it.
- Mehmoon may make direct edits to documents himself (uploads a modified version) — that becomes the new working base; preserve those changes, don't revert them.
- Direct, single-number answers are preferred over detailed breakdowns for pricing/recommendation-type questions.
