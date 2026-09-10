# CLAUDE.md — Kayani Autos / Kiyan Traders Business Management System

This file is the source of truth for project context across sessions and across the two Claude accounts working on this build (planning account and this implementation account). Keep it updated as decisions are made. Log individual decisions with rationale in `DECISIONS.md`; keep this file as the current-state summary.

**Full field-level source material lives in `docs/planning/`** — imported 2026-09-08 from the planning-account Claude Project (see DECISIONS.md for the import event). Read those files before doing schema work on any module not yet summarized in detail below:
- `docs/planning/kayani-erp-project-handover.md` — the primary handover doc: full data model (Forms A–G, field-by-field), sales document chain, vouchers, reports, system-wide conventions, glossary, non-functional requirements, the 14-item open-questions checklist, build phases/timeline.
- `docs/planning/kayani-erp-full-export.md` — chat-only context not written into any saved file, plus explicitly flagged version conflicts (see section 6 below).
- `docs/planning/client-qa-2026-09-10.md` — the client's own written answers to a direct question list (roles, 1A/Control Part relationship, reports, chart of accounts finality). See sections 4, 5.2, 6, 8, 9 below for what this resolved.

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

## 4. Chart of Accounts — CONFIRMED FINAL by the client (2026-09-10)

**The client confirmed the chart of accounts as final** in `docs/planning/client-qa-2026-09-10.md`: "Chart of accounts are final but you should define coding in a way to create space for future expansion of it. Moreover, though main account code is one but reports would be based on classification on the basis of party form." He also re-sent the same `chart of accounts.xlsx` alongside that answer — verified cell-by-cell against what's already seeded in this repo, exact match, no new content. This is the sign-off that was previously missing (see the "what remains open" note below, now resolved).

Two explicit instructions came with the sign-off, both already anticipated as design notes but now upgraded to direct client requirements:
- Coding must be expansion-ready (no scheme given yet — still need to propose one).
- Report classification is based on the Party Form (Status/Nature codes), not the account code alone.

**Not explicitly addressed by this confirmation:** the possible duplicate-looking pair — "Income Tax Payable"/"GST Payable" under Equity & Reserves alongside the Income/(Loss)-section "...Withheld/Payable" accounts (both status-of-party-wise). The client said the list is final without singling this out, so treat it as accepted as-is unless it causes a real problem downstream (e.g. duplicate postings) — not worth a dedicated follow-up question on its own.

Historical context (how this got here — kept for the record, no longer an open decision):

1. **A memory-held earlier version** (planning-account chat memory, source/date unknown) — has "Softwares/Computer & Hardware," "Income Tax Withheld"/"GST Withheld" under *Current Assets*, and lacks everything unique to version 2 below.
2. **The 2026-09-07 client spreadsheet version** (`docs/planning/kayani-erp-full-export.md` section 2, sourced from `chart of accounts.xlsx`) — has "ERP, Computer & Hardware" instead, moves the Withheld/Payable accounts to *Income/(Loss)* marked status-of-party-wise, and adds "JS Kiyan Traders" (bank account), LPP provision accounts (in two different sections), "Income Tax Payable"/"GST Payable" under *Equity & Reserves* (a **confirmed** duplicate-looking pair alongside the Income/(Loss)-section Withheld/Payable accounts — verified present in the real file, not a transcription error; still flag to client, don't assume it's intentional), and "Travelling Expense Account." **Directly verified against the actual spreadsheet cell-by-cell 2026-09-08** — exact match, strongest provenance since it's a real client file, not a relayed summary.

**This repo's schema and seed data now match version 2 exactly** (`src/db/schema/accounts.ts`, `src/db/seed.ts`, updated and re-verified against the live local database 2026-09-08): all 29 line items with verbatim wording (including the client's own apparent typo "Cost of Good Sold," singular — preserved rather than silently "corrected," since matching the source file was the point), the 6th bank account ("JS Kiyan Traders," entity-tagged to Kiyan Traders), and a new nullable `note` column on `chart_of_accounts` carrying the four party-wise/LIFO annotations verbatim. Structurally unchanged and still correct regardless of which COA content-version ultimately wins: single flat table, entity differentiation **only** at the bank-account level (now 6 rows tagged with `legal_entity_id`, every other row `null`).

**Design notes:**
- LIFO costing for COGS must be **deliberately built** into the inventory engine — not a default behavior in most ORMs or standard inventory schemas.
- Chart of accounts coding should be expansion-ready — no numbering scheme has been provided yet.
- Report classification should be based on the **Party Form** (section 5.5) — Status (C1/C2/C3) and Nature (S1/S2/S3) codes, in addition to per-entity (KA/KT) split.

---

## 5. Full Data Model (from client's own handwritten planning notes)

*Full field-level detail for all of this is in `docs/planning/kayani-erp-project-handover.md` section 7 — this is a summary with pointers, not a replacement. Treat the handover doc as closer to source-of-truth than this summary for these specific modules; it's a direct transcription of the client's own notes, not a paraphrase of a paraphrase.*

### 5.1 Item Form (Form "A") — the base sellable/stockable unit
Lettered fields a–i: Item Code (auto-generated, **explicitly noted as a future barcode candidate** — design the code format with barcode-symbology compatibility in mind), Part No, Brand, Origin (no duplicates), Class, Engine Info, Model, Size, Control Part No. (a lookup into Form B, not free text). Plus system fields: RPP, SAP (see Glossary, section 5.11), Safety Stock Days (feeds Stock Ordering, 5.6), Print Name (auto-composed as `Class + Part No + Brand`, editable — see the Print Name pattern in 5.9).

### 5.2 Items/Markers Control Form (Form "1A") — distinct from Control Part Form
**Largely resolved 2026-09-10** — asked the client directly (`docs/planning/client-qa-2026-09-10.md`); his answer: "Markers Control Form (first step) → Item Creation Form (dropdown from first step) → Control Part Number (linking of different part numbers under one parent part number and also against which detailed information will be inserted applicable to all linked part number)." This describes the same three-step chain already built — `markers → items → control_parts` in `src/db/schema/inventory.ts` — not the more elaborate "Form 1A governs fields a)–h) of Form A" reading pulled from the handover doc's transcription of his earlier notes. Treat the simpler, already-built structure as the confirmed one going forward.

`[unclear — confirm]` **Still not addressed by this answer:** whether Form A's lettered fields (Item Code, Part No, Brand, Origin, Class, Engine Info, Model, Size — section 5.1), RPP/SAP, Print Name, and Safety Stock Days live on the Item Creation Form step specifically, or are split across steps. The client's answer to a separate question ("what info do you write down for a new part" → "As per item creation form... detailed discussion again if need be") suggests he's willing to walk through this in more detail when asked concretely — worth a short follow-up before Form A's fuller field set gets built out, but no longer a blocker on the basic three-step shape.

### 5.3 Control Part Form (Form "B") — vehicle fitment/compatibility record
Fields under "Control Part Number": Model name, Frame/Engine name, Year From, Year To, Engine capacity/CC, Transmission, Engine Fuel. **One Control Part can have 10–15 fitment lines** (client's own estimate) — design the fitment child table for this volume as the norm, not the edge case. The Control Part ↔ Item attachment is **explicitly manual**, not inferred. Searching any one Item should surface all Items sharing its Control Part Number (cross-variant visibility, e.g. "Original"/"Japan"/"Thailand" variants of the same functional part).

`[unclear — confirm]` This repo's `car_models` table (`make`, `model`, `yearFrom`, `yearTo`) is missing Frame/Engine name, Engine capacity/CC, Transmission, and Engine Fuel from the actual spec above — a real gap, not just a naming difference, if the parts↔car-models join is meant to carry Form B's full fitment detail.

### 5.4 Deal Part Form (Form "C") — bundling layer — **first pass built 2026-09-10**
Two or more Items combined under a manually-named bundle (**Print Name is manually typed, unlike Form A's auto-composed one** — don't reuse the same print-name logic between the two). The bundle itself never holds stock — a Deal Part sale posts stock movement against the underlying Items. Pricing (RPP/SAP/sale price) is decided at time of sale, not cached on the Deal Part definition; the system must keep a full price record per transaction since of this.

Built as `deal_parts` + `deal_part_components` (`src/db/schema/deal-parts.ts`) and sold as a `sales_document_lines` row with a nullable `dealPartId` in place of `controlPartId` — see section 9's build log entry for the full detail, including what's deliberately not built yet (the "posts stock movement against the underlying Items" part, and Deal Part lines on Quotation/DN, only POS checkout can sell one so far).

### 5.5 Party Form (Form "D") — customers & vendors — **first pass built 2026-09-08**
Fields: Name, GST No, NTN No, 1–5 phone numbers, **Status of Party** (`C1` Corporate / `C2` Retail-Counter / `C3` Wholesale — client's notes show "O2," almost certainly a slip for "C2"), **Nature of Party** (`S1` Vendors/Suppliers A/C / `S2` Market Supplier A/C / `S3` Customer Receivable A/C), Print Name (defaults to Name, editable). Status and Nature are **two independent classification axes** — every Party needs both. Drives pricing tier, discount display, and which ledger account family a party posts against.

Built as `parties` (Status/Nature modeled as enums, same reasoning as `account_category` — see section 4) and a child `party_phone_numbers` table (`src/db/schema/parties.ts`). The 1–5 phone number cap is enforced at the application layer, not the database. Status uses `C1`/`C2`/`C3` per the confirmed reading of the notes — `[unclear — confirm]` if the client actually meant something by "O2" literally. Validated end to end against the local database: inserts, multiple phones per party, and enum rejection of an invalid status code all confirmed working. Not yet linked to anything — chart-of-accounts party-wise reporting, Sales documents, and Customer/Supplier ledgers all still need to reference this table once they're built.

### 5.6 Stock Ordering Module (Form "E") — not built yet
Reorder suggestions based on Safety Stock Days (Form A). On-demand report generation. Can feed directly into a purchase order (add ordered qty + supplier + price from this screen). Client's notes mark this "Detail Discussed" — worth a follow-up to recover the fuller detail behind the shorthand.

### 5.7 Stock Adjustment Form (Form "F") — not built yet
Pick Item Code → system shows current qty → staff enters +/- adjustment qty → **mandatory, detailed comment** (audit trail for shrinkage/damage/recount) → on posting, SAP is adjusted as a consequence. Also marked "Detailed Discussion" in client's notes.

### 5.8 Authority Levels / Form (Form "G") — the least-specified module, do not build schema for this yet

**Role list now confirmed 2026-09-10** — asked the client directly "how many roles / list the staff types," and he answered with exactly the five-role list already seeded in this repo (`docs/planning/client-qa-2026-09-10.md`): Counter Control / Corporate Control / Receipts/Payments Control / Inventory Control / Management Control. This retires the three-tier candidate (Owner/Manager/Cashier) — treat the five-role list as the confirmed role structure going forward. See section 6 for the full status correction.

**Still open — the actual scoping conversation this section has always needed:** asked directly what each role should be allowed to do (cost visibility, discount approval), the client's answer was "It has to be flexible and I can choose or edit at any time" — confirms the runtime-configurable-permissions principle, but gives no default permission matrix. Still needs client input: (1) what needs sign-off *before* it happens vs. (2) what only needs after-the-fact visibility; (3) who can see margin/cost data vs. just sale price by default; (4) does authority enforcement need to work offline, and can a cashier bypass something while disconnected; (5) whether "Authority Levels" (this form) and the basic RBAC scaffold already built are the same concept.

Confirmed so far: scope is **global** (one role model across both KT and KA, not per-entity); controls **both** approval authority (who can authorize actions) and access control (who can see/use what).

**Do not hardcode role names or a fixed role count in the schema** — the admin must be able to create arbitrary roles at runtime, even though the five named above are now the confirmed starting set. This constraint is why `roles`/`permissions` are tables, not enums.

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

## 6. Roles / Authority Levels — status correction (2026-09-08), then confirmed (2026-09-10)

The previous version of this file stated "five roles confirmed" for section 5.8 above. Reconciling against the full planning history (`docs/planning/kayani-erp-full-export.md` section 4.3) showed this overstated things: the five-role list was one of **two candidates discussed with the client, neither actually confirmed at the time**. This repo's RBAC schema and seed data (`src/db/schema/users.ts`, `src/db/seed.ts`) had already gone ahead and seeded the five-role list as `is_system: true` rows, as if settled — flagged here rather than unwound, since the seed data was harmless placeholder, not load-bearing.

**Update 2026-09-10:** the client has now directly confirmed this list, in response to a direct question ("how many user roles do you want... list the staff types") — see `docs/planning/client-qa-2026-09-10.md` and section 5.8. He named exactly the five roles already seeded: Counter Control / Corporate Control / Receipts/Payments Control / Inventory Control / Management Control. **The five-role list is no longer a placeholder assumption — treat it as the confirmed role list.**

**What's still not confirmed:** per-role permissions (who approves what, who sees cost/margin) and whether "Authority Levels" (Form G) is the same concept as this basic RBAC scaffold — both still open, see section 5.8. Do not build approval-limit/authority logic on top of this scaffold until those are settled.

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

**Asked directly, 2026-09-10, still not final:** asked the client to confirm the full report list (`docs/planning/client-qa-2026-09-10.md`); his answer: "More focused on developing the structure. Reports would be for sure from same structure. However, at this stage, bear with me for reports." Confirms reports will be derived from the (now-final) chart of accounts structure, but the list itself is explicitly still open — do not treat this as a resolution. He also confirmed report **visibility** will map to the five confirmed role groups (section 6): "Will link different reports to different groups as stated above."

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
- Data migration prerequisites unconfirmed: current system (named software vs. Excel), DB access vs. exports only, how much history to migrate, whether KT/KA data is already cleanly separated in the old system. **Asked directly, 2026-09-10, did not resolve:** asked the client to name his current ready-made system and share sample Excel files (`docs/planning/client-qa-2026-09-10.md`); his answer — "All is through system except that info is not structured. Moreover couldn't understand what you are asking" — shows the question itself didn't land. No system name or files were shared. Needs a simpler, more concrete follow-up (e.g. a screenshot of the current system, or naming a specific file) rather than re-asking the same way.
- **First real, running vertical slice — built 2026-09-09, restyled same day.** Until now, everything above only existed as schema (visible via SQL) or a static mockup (fake data, no logic). This is a genuinely working path: a Fastify API (`src/server/`) with a real login endpoint (bcrypt-checks a PIN against the real `users` table, returns real roles), a real staff-list endpoint for the login picker, and a real parts-search endpoint (queries the real seeded `control_parts`/`items`/`markers`/fitment data), plus a React frontend (`web/`) styled to match the approved design concept above — real logos, real PIN pad, real staff picker, the confirmed business contact footer, same accent color/touch-target fixes as that concept's own accessibility review. Run with `npm run dev` (starts the API on :4000 and the frontend on :5173 together) after `npm run db:seed` and `npm run db:seed:dev` (the latter is local-dev-only sample data — a demo user `asif.raza` / PIN `1234`, two sample oil filters, one car-model fitment link — never confirmed business data).
- **Real POS checkout — built 2026-09-09.** The POS screen now does a full real sale: add parts to a cart (staff types the gross price per line, per the confirmed gross-price-entry pattern — no price is pulled from a catalog field, since none exists), an entity selector (real data from a new `GET /api/entities`), itemized discounts gated to Kiyani Autos only (rejected server-side for Kiyan Traders, capped at 2), and a checkout that creates a real, posted `sales_documents` invoice with real lines and discounts. This is the first thing in the whole project to actually use `document_number_counters` — see the new `src/server/services/document-numbers.ts`. Amounts are always recomputed server-side, never trusted from the client. No tax computation (still not built — CLAUDE.md 5.10). A sale can now attach to a real party or stay walk-in — see the Party management entry below, added the same day.
- **Real Inventory screen — built 2026-09-09.** Completes the original 3-screen concept with a real counterpart (Login, POS, and now Inventory all have working screens, not just mockups). Full CRUD against the schema exactly as it exists today — markers → items → control parts, parent/child variant linking, and car-model fitment (attach an existing model or create a new one inline). Builds against the current one-item-per-control-part FK deliberately, without trying to quietly resolve the still-open [unclear — confirm] question (CLAUDE.md 5.2/5.3) of whether a Control Part should attach to multiple Items per the client's actual notes — that's a schema decision for the client, not something to redesign while building a CRUD screen. New nav bar (`AppHeader.tsx`) switches between POS and Inventory. One minor, non-blocking UI quirk observed once during testing: a just-added fitment tag didn't render immediately in one session (network request got aborted client-side) but was correct in the database and appeared normally after a reload — worth a look if it recurs, not treated as a real bug yet.
- **Real Party management, wired into checkout — built 2026-09-09.** First CRUD for the Party Form (section 5.5): create a party with Status (C1/C2/C3) and Nature (S1/S2/S3) — both required, shown with human-readable labels in the UI — plus 1–5 phone numbers. New `Parties` nav tab (`PartyView.tsx`). The POS checkout's customer picker (`GET /api/parties?nature=S3`) filters to Nature "S3" (Customer Receivable A/C) parties only — `[unclear — confirm]` this reading that Nature, not Status, is what determines whether a party is a valid sale counterparty; the management screen itself doesn't filter, since vendors/suppliers (S1/S2) need records too. Checkout's `partyId` is optional — a sale can attach to a real party or stay walk-in (null), matching the original mockup's "Walk-in customer" default. Verified end to end: created two parties through the real UI form, selected one in a live checkout on each entity, and confirmed both invoices show the correct attached party in the database (one Kiyani Autos sale, one Kiyan Traders sale).

- **Real Sales History, opened via Ctrl+H — built 2026-09-09.** Closes a gap that had been open since the first checkout: every invoice checkout creates was only ever visible via a direct SQL query until now. New `GET /api/sales` (list, searchable by document number or party name, newest first) and `GET /api/sales/:id` (full detail with lines and discounts). New `SalesHistoryView.tsx`, reachable both from the nav bar and via a global **Ctrl+H** shortcut (Mehmoon's request) — matches the F1-F9 lookup-shortcut convention already confirmed for this project (section 5.9). The shortcut is a `window` keydown listener with `preventDefault()` for this browser-dev pass; inside the eventual Electron app this should become a proper menu accelerator instead. Verified end to end: opened via the actual keyboard shortcut (not just a click), confirmed every invoice from prior sessions lists correctly, and confirmed the detail panel shows the right line items, quantities, prices, and total for a real invoice.
- **Real Quotation creation — built 2026-09-09.** First time any document type other than Invoice has been created for real. New `POST /api/quotations`, reusing the same `sales_documents` table (so it shows up in Sales History automatically) but with `documentType: "quotation"` and `status: "draft"` always, never `"posted"` — per CLAUDE.md 5.10/handover 8.1, a Quotation "is just a subsidiary record and requires no accounting," the one document in the chain that doesn't follow post/unpost. Captures the confirmed Quotation-specific fields (Customer Ref, Our Ref No., P.O. No., Vehicle Details, Validity) and snapshots the selected party's GST/NTN onto the document, same as checkout does. The checkout-vs-quotation duplication (party snapshot, discount validation, line-total math) was extracted into `src/server/services/sales-document-helpers.ts` and checkout was refactored to use it too — real shared logic, not premature abstraction, since both routes needed the identical rules. `[unclear — confirm]`: whether a Quotation requires a party (left optional, matching Invoice) and whether the Kiyani-Autos-only discount rule (confirmed for a "sale"/checkout) also applies to Quotations (assumed yes, for consistency, not explicitly specified). New `Quotations` nav tab (`QuotationView.tsx`). Verified end to end through the real UI: selected a real customer and entity, added a real part, entered a PO number, created the quotation, confirmed the exact fields (status "draft," customer ref, party, total) in the database, and confirmed it appears correctly in Sales History (Ctrl+H) alongside invoices.
- **Real Delivery Note creation, plus generic Post/Unpost — built 2026-09-09.** Second document type in the chain. New `POST /api/delivery-notes`, `documentType: "delivery_note"`, always created `status: "draft"` (unlike checkout's Invoice, a DN needs an explicit separate Post step per the confirmed Post/Unpost pattern — section 5.9). Two entry modes in the new `DeliveryNoteView.tsx`: "Prepare directly" (search parts and build lines from scratch, same pattern as checkout/Quotation) and "From Quotation" (pick an existing Quotation, then **individually check which lines carry over and edit each one's quantity independently** — per the confirmed spec that conversion is per-line, not "convert the whole Quotation as one unit"). Converting from a Quotation writes a `sales_document_links` row (`fromDocumentId` = Quotation, `toDocumentId` = new DN) — the first real use of that table outside a rolled-back test transaction. Also added, generically on `sales_documents` rather than DN-specific, since Invoice (checkout) posts itself immediately and Quotation never posts, making Delivery Notes the first real user of post/unpost from the UI: `POST /api/sales/:id/post` and `POST /api/sales/:id/unpost`, wired into `SalesHistoryView.tsx` as status-gated buttons (hidden entirely for Quotations, "Post" shown when `draft`/`unposted`, "Unpost" shown when `posted`) plus a status badge shown on every row and in the detail panel. Unposting deliberately does not clear `postedAt`, preserving audit history that the document was posted at some point — `[unclear — confirm]` whether a separate `unposted_at` column is eventually wanted for a full audit trail. **Self-caught bug during this build** (fixed before any testing, not from user feedback): the "From Quotation" line-resolution logic initially tried to submit the Quotation line's `partNumber` string as the DN line's `controlPartId`, since `GET /api/sales/:id` didn't return the real `controlPartId` UUID at all — fixed by adding `controlPartId` to that endpoint's response schema and query, and to the frontend detail type, rather than working around it. **Separately, while browser-testing this feature, found and fixed a real pre-existing bug in `LoginView.tsx`** (not part of this feature, from the earlier login build): `pressDigit`/`pressBackspace` read `pin` directly from closure (`setPin(pin + digit)`) instead of using the functional updater form; rapid consecutive PIN-pad presses within the same React batch silently dropped earlier digits (confirmed via a synthetic same-tick quadruple click that produced a pin of just `"4"` instead of `"1234"`). Fixed to `setPin((prev) => ...)` on both functions. Verified end to end through the real UI: created a standalone DN (KT-DN-0002), created a Quotation with two lines (KT-QTN-0003), converted it to a DN selecting only one line and a partial quantity (2 of 5) to a new DN (KT-DN-0003, confirmed total Rs 1000.00 = 2 × Rs 500), then from Sales History posted KT-DN-0003 (badge flipped to POSTED, button flipped to Unpost) and unposted it again (badge flipped to UNPOSTED, button flipped back to Post), and confirmed the Quotation's own detail view correctly shows no Post/Unpost button at all.
- **Real Stock Adjustment (Form F), plus the first stock-quantity ledger — built 2026-09-10.** Before this, no feature in the app tracked a real quantity-on-hand at all — checkout, Quotation, and DN all let staff "sell" parts without ever touching a stock figure, because none existed. New `stock_movements` table (`src/db/schema/stock-movements.ts`): an append-only ledger, not a single mutable `quantity_on_hand` column — current quantity for a part is `SUM(quantity_delta)` over its rows. Chosen this way per Mehmoon's direction (2026-09-10) specifically so it doesn't need a rewrite once LIFO cost layers are built (CLAUDE.md "LIFO must be deliberate") and so it satisfies the client's own audit-trail requirement for this form. `movementType` only has `"adjustment"` today — sale/purchase movement types are a future integration, deliberately not built here; checkout/Quotation/DN still don't touch this table. New `POST /api/stock-adjustments` (writes a ledger row immediately — no separate draft/post stage of its own, since the client's own notes describe a single-step flow unlike Quotation/DN/Invoice; `[unclear — confirm]` if an approval gate is actually wanted), `GET /api/stock-adjustments/quantity/:controlPartId` (current computed quantity), and `GET /api/stock-adjustments` (recent history, newest first). New `StockAdjustmentView.tsx` and nav tab: pick a part via the existing search, see its current quantity, enter a +/- delta with a mandatory reason comment (enforced as non-empty; "detailed" isn't given a specific length by the client, so no arbitrary character minimum was invented), save, see the running history update. **Deliberately not built**: "on posting, SAP is adjusted as a consequence" (client's note, CLAUDE.md 5.7) — SAP doesn't exist as a schema field anywhere yet (Form A/RPP/SAP were never built) and its exact business definition is still unconfirmed (glossary, 5.11); adding a guessed-at SAP column just to satisfy that line would be building on an unconfirmed concept. Verified end to end through the real UI: searched and selected a real part (starting quantity 0), adjusted +25 with a comment (quantity became 25, appeared in history), then adjusted -8 with a different comment (quantity became 17, both entries visible newest-first in history with correct signs) — also confirmed via curl that a zero-delta adjustment and an empty comment are both rejected with 400.
- **Real Deal Part (Form C) — built 2026-09-10.** First bundling feature: two or more Items sold and printed under one manually-typed name (CLAUDE.md 5.4). New `deal_parts` (the bundle definition: `printName`, `description`, `isActive`) and `deal_part_components` (the recipe: which control parts, how many of each) tables (`src/db/schema/deal-parts.ts`) — the bundle itself carries no price and no stock, matching the confirmed spec exactly ("the bundle itself never holds stock... pricing is decided at time of sale, not cached on the Deal Part definition"). Selling one is just a normal `sales_document_lines` row with a new nullable `dealPartId` column set instead of `controlPartId` (also newly nullable) — enforced at the application layer that exactly one of the two is ever set, same enforcement style as the existing discount/phone-number caps. New `GET/POST /api/deal-parts` for the bundle CRUD and a new `DealPartView.tsx` nav tab. **Scoped to POS checkout only for selling** — `checkoutLineSchema` (sales.ts) is the only line schema updated to accept `dealPartId`; Quotation's and DN's own line schemas are untouched and still only accept `controlPartId`, so neither can create a Deal Part line yet. `GET /api/sales/:id` (used by Sales History, and by DN's "convert from Quotation" flow) was updated regardless, since it reads every document type through one endpoint and needed to resolve a Deal Part line's name/absence-of-part-number correctly either way — `partNumber`/`controlPartId` are now nullable on that response, `catalogName` is always present via `COALESCE(controlParts.name, dealParts.printName)`. DN's "from Quotation" line picker now filters to lines that actually have a `controlPartId`, defensively — not a real scenario yet since Quotation can't produce a Deal Part line, but the type is honestly nullable now so the UI doesn't assume otherwise. **Deliberately not built**: Deal Part sales don't decrement stock for the underlying Items (client's note: "a Deal Part sale posts stock movement against the underlying Items") — no sales feature of any kind touches the `stock_movements` ledger yet (see that table's own header comment), so this is a pre-existing, already-flagged gap, not something Deal Part specifically needed to solve. **Also found and flagged (not fixed here, spun off separately)**: while reading `sales.ts` for this work, noticed POS checkout calls `snapshotPartyTaxInfo(partyId)` but discards the result, unlike Quotation/DN — every checkout Invoice with a party attached has been saving `null` for customer GST/NTN instead of the party's real values. Verified end to end through the real UI: created a bundle ("Oil Change Combo," two components) via the new screen, added it to a POS cart (shown as "Deal part" in place of a part number), entered a gross price, checked out (KT-INV-0004, Rs 750.00), and confirmed it in Sales History with the correct name, "Deal part" label, and total — also curl-verified checkout still works unchanged for a regular part-only line, and that a line with both or neither of `controlPartId`/`dealPartId` set is rejected with 400.
- **Nav restructured into modules — built 2026-09-10.** The flat 8-button nav bar (POS, Quotations, Delivery Notes, Inventory, Stock Adjustment, Deal Parts, Parties, Sales History) was too much for counter staff who need POS reachable fast (CLAUDE.md 1's "fast counter operation"). `AppHeader.tsx` now groups it: **POS Counter** and **Parties** stay standalone always-visible tabs, **Sales** (Quotations/Delivery Notes/Sales History) and **Inventory** (Inventory/Stock Adjustment/Deal Parts) became click-to-open dropdown modules, closing on selection or on a click outside the nav. A module button stays visually highlighted whenever the currently open screen belongs to it, even with the dropdown closed. Chosen as a module split (not a single "More" catch-all) specifically so Purchasing/Accounting/Reports can slot in as new module entries once those phases are built, rather than overloading Sales/Inventory further — no placeholder tabs were added for those now, since neither has schema or even a confirmed report list yet. **This only changes the nav's visual grouping — every view is still reachable by every logged-in user.** Role-based visibility (which tabs a given role even sees) was discussed as a deliberate follow-up, not built in this pass — Mehmoon's direction (2026-09-10): it lands when an Admin Settings / Roles module is built (an actual screen for managing `roles`/`permissions`, not just this scaffold), not before — see DECISIONS.md.
- **Admin Settings / Roles module — built 2026-09-10.** First real screen against the RBAC scaffold (`src/db/schema/users.ts`) that's existed since the start of the project — until now `roles` could only be created via `src/db/seed.ts`, and `users` only via a seed script, never through the app itself. New `GET/POST /api/admin/roles` (create a custom role — always `isSystem: false`; the five confirmed system roles stay as seeded) and `GET/POST /api/admin/users` plus `PUT /:id/roles`, `POST /:id/activate`, `POST /:id/deactivate` (create a staff account with a PIN, toggle its role assignments as a set of chips, deactivate/reactivate it). New `AdminSettingsView.tsx` and a standalone **Admin Settings** nav tab (not a module — same reasoning as Parties, since it's one screen). **Deliberately scoped to roles and users only — no permissions-grant UI.** CLAUDE.md 5.8 is explicit that `permissions`/`role_permissions` (what a role can actually do) stay untouched until the Authority Levels scoping conversation happens; the permission-key catalog is still intentionally unseeded. `[unclear — confirm]`: PIN length is enforced as 4-6 digits, inferred from the existing PIN pad's `MAX_PIN_LENGTH` (6) and the demo PIN's length (4) — the client has never actually specified a PIN format rule. This is also the first place any endpoint in the app isn't gated to "every logged-in user" only because nothing is gated at all yet (`src/server/app.ts`'s own comment on deferred session/auth-token handling) — a pre-existing limitation, not a new one. Verified end to end through the real UI: created a custom role ("Shift Supervisor"), created a new staff account (Bilal Shah, PIN 4321) with no roles, toggled the new role onto him via the chip UI and confirmed via the database it replaced his role set correctly, deactivated him and confirmed via `/api/auth/login` that he could no longer sign in, and confirmed the existing demo user's own role-chip toggle (accidentally triggered once during testing due to a DOM-query mistake, not an app bug) correctly updated and reverted his role set both times.

## 10. Data Migration (scoped and priced separately from the core build, but bundled into project cost, not billed as a separate line item)

Outstanding balances migrate differently by party: Corporate (KT) customers migrate invoice-wise, preserving invoice-level structure; everyone else migrates as a standalone running balance. A short data assessment needs to happen before migration work starts.

---

## 11. Open Questions (tracked, not yet resolved)

Do not resolve these silently in code. Flag with `[unclear — confirm]` and raise with the client at the appropriate phase. The full 14-item checklist with sources is in `docs/planning/kayani-erp-project-handover.md` section 19 — this list is the condensed, prioritized version plus items surfaced since.

~~**Chart of accounts**~~ — **RESOLVED 2026-09-10, client confirmed final** (section 4). No longer an open version conflict.

~~**Authority Levels / roles — which candidate structure**~~ — **RESOLVED 2026-09-10, client confirmed the five-role list** (sections 5.8, 6). Per-role permissions remain open, see below.

**Still flagged as active — highest priority to settle:**
- Reports/Vouchers: three non-matching lists (section 8) — asked the client directly 2026-09-10, still explicitly deferred ("bear with me for reports").
- Per-role permissions (who approves what, who sees cost/margin) — the five roles are confirmed but the client wants this fully admin-editable rather than giving defaults now (section 5.8).
- Migration source data (current system name, sample files) — asked directly 2026-09-10, client didn't understand the question, needs a simpler concrete follow-up (section 9).

**Everything else, roughly grouped:**
- Exact relationship between Items/Markers Control Form (1A) and Control Part Form (B) — **largely resolved 2026-09-10, see section 5.2** for the remaining narrower gap (where Form A's lettered fields/RPP/SAP/Print Name/Safety Stock Days actually live).
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
