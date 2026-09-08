# Kayani Autos / Kiyan Traders ERP — Full Project Handover

*Paste this whole document as the first message in the new Claude Project. It consolidates every relevant detail from all prior conversations — full data model, field-level form specs, architecture, and open items. Nothing here should need re-deriving from scratch.*

---

## 1. Who's involved

- **Consultant/Developer**: Mehmoon, operating under **PLYXIO** (info@plyxio.com, +1 646 222 3911). Acting as both the consultant who scoped/sold the project and the developer building it personally, with Claude assisting throughout.
- **Client**: Kayani Autos / Kiyan Traders, an auto parts shop in Gawalmandi, Rawalpindi, Pakistan.
- **Primary client contact**: Ghaus Kayani (communicates over WhatsApp, in a terse, businesslike style).

## 2. The business

Two legal entities under one physical roof, sharing a single inventory pool but requiring separate books:

- **Kiyan Traders (KT)** — corporate entity, GST-registered, FBR POS integrated on 3 workstations.
- **Kiyani Autos (KA)** — retail entity, no FBR integration.

The completed ERP will be **owned by Kiyan Traders**; wording may still need to explicitly cover both entities since Kiyani Autos is equally served by the system.

**Staff profile**: counter staff are non-technical, blue-collar workers. Hard UX constraint — screens must be simple, fast, forgiving: large touch targets, minimal typing, barcode/scan-friendly, clear error states, fast counter operation.

**Central business risk**: internet connectivity in the client's area is not reliable. The system must keep billing, selling, and tracking stock during outages of hours to days, with no data loss and no double-selling of stock across counters. This is the reason the client is paying for a more sophisticated architecture instead of a plain cloud web app — not a nice-to-have.

---

## 3. Project status

- **Package confirmed: Local + Cloud (offline-first architecture).**
- **Advance payment received** — project timeline is officially active.
- Client can be anxious/demanding in tone at times (e.g. a message pushing for more active engagement) — generally read as anxiety-driven rather than scope escalation, not a sign of a fundamentally difficult client. Worth staying ahead of with proactive updates.
- Client reviewed and hand-annotated the proposal document earlier in the process, raising: consolidated vs. separate accounting books question, a request for a scope walkthrough meeting, and custom/additional inventory fields.

---

## 4. Tech stack (agreed)

- **Frontend/terminal app**: Electron + React — chosen over browser-based approaches for native hardware access (receipt printers, barcode scanners, cash drawers).
- **Backend**: Node.js / TypeScript (Express or Fastify).
- **Local database**: PostgreSQL — chosen over SQLite specifically for concurrent multi-terminal write support.
- **Cloud sync**: Supabase, via an outbox pattern (local Postgres is the single source of truth; a background worker pushes to Supabase when online).
- **ORM**: Prisma or Drizzle — not yet finalized between the two.
- **Owner dashboard**: React on Vercel, for remote read-only access.
- **FBR compliance**: separate `fbr_queue` table, decoupled from general cloud sync, with its own retry worker and independent status tracking (queued → submitted → acknowledged/failed).
- **Open architecture question, unresolved**: should in-shop terminals run a unified Electron setup (one terminal doubling as server), or a dedicated always-on server process separate from any terminal UI? Needs a decision before local-server implementation starts.

### Infrastructure cost
Free tiers are **not viable**: Vercel Hobby prohibits commercial use (this is a paid client engagement); Supabase free tier auto-pauses after 7 days of inactivity (incompatible with the local-server-plus-cloud-mirror pattern) and its 500MB cap is too small, plus no backups on the free tier (unacceptable for a compliance-sensitive system).
**Recommended budget**: Vercel Pro (~$20/month) + Supabase Pro (~$25–35/month) = **~$45–55/month**, to be presented to the client as a transparent line item, framed as minor relative to the build fee and the risk of a paused database during business hours.

---

## 5. Build phases & timeline (from the finalized proposal)

| Phase | Deliverable | Duration | Applies to |
|---|---|---|---|
| 1 | Discovery wrap-up, UI/UX design and prototype, review of existing system workflows | 1–2 weeks | Both packages |
| 2 | Core build: Sales module (quotations through invoices) and Inventory module (catalogue, fitment search, variants) | 5–6 weeks | Both packages |
| 3 | Purchasing, goods receipt, supplier returns, delivery challans | 2–3 weeks | Both packages |
| 4 | Accounting: dual chart of accounts, ledgers, settlement channels, journal entries, core reports | 3–4 weeks | Both packages |
| 5 | FBR POS integration for Kiyan Traders workstations, offline invoice queue | 1–2 weeks | Both packages |
| 6 | Local server + LAN sync engine, on-site setup | 2–3 weeks (parallel) | Package 2 only |
| 7 | Data migration (post assessment): inventory, customers/suppliers, outstanding balances, sales history | Scoped separately | Both packages |
| 8 | UAT, staff training (designed for non-technical/blue-collar users), go-live support | 1–2 weeks | Both packages |

**Target completion: December 2026.** Phase 6 (local sync engine) runs alongside Phases 3–5, not after them, to keep on track for a December go-live. Data migration also runs in parallel once source access is available.

---

## 6. Full functional scope — by module

### 6.1 Sales
- Different formats for KA and KT (separate letterhead/layout per entity).
- Document chain: **Quotation → Delivery Note (DN) → Proforma Sales Tax Invoice / Sales Tax Invoice**.
- **Discount handling differs by entity**: itemized discount line for Kiyani Autos (retail); net-of-discount pricing, no separate line, for Kiyan Traders (corporate).
- **Credit vs. cash**: KT corporate customers can buy on credit, settled invoice-wise; KA retail is always cash at point of sale.
- **Settlement channels**: Cash, EasyPaisa, JazzCash, Bank Transfer — each must post to the correct chart-of-accounts account. Open question: can a single sale be split across multiple settlement channels?
- **Margin alert**: soft warning (not a hard block) when a line item's margin falls outside a configured band; posted line items get a persistent highlight color after posting so it stays visible in reports/history. A margin-override log report should exist. Open question: is the margin limit per category, per item, or one global limit? Does an override need admin approval or just a click-through?
- **Gross-price-entry pattern**: staff insert the gross price; the system computes the tax breakdown. True across Quotation, DN, and Invoice.
- **Print Name pattern**: system-composed but editable on-screen; whatever's in the field at save time is what prints. Uniform across Quotation/DN/Invoice.
- **Manual control over line sequencing/serial numbering** for print — identical behavior across Quotation, DN, and Sales Invoice; build once as shared behavior.

### 6.2 Inventory
Most complex module due to vehicle-parts-specific fitment logic (see full data model in §7).
- **Vehicle fitment/compatibility search** — by vehicle model + year range, by engine/frame code, or directly by control part number.
- **Variant grouping under a Control Part Number** — e.g. "Original," "Japan," "Thailand" are variants of the same functional part; searching any one variant should surface the others as alternatives (cross-variant visibility).
- **Linked/complementary item suggestions** (e.g. clutch plate + pressure plate) — open question whether manual or system-inferred; default assumption is manual (matches how Deal Part already works) unless told otherwise.
- **Generic catch-all item** — routing mechanism for uncatalogued parts, so a sale is never blocked for lack of a catalog entry.
- **Configurable negative stock** — shop's current practice allows sales even into negative stock (sell first, reconcile later); preserve as default, make configurable since it's a business-risk decision, not a technical one.
- **Part history** — purchase history, sales history, and price-change history, all viewable per item. Not prioritized/ranked by the client — build all three.

### 6.3 Purchasing, Delivery & Returns
- **Purchase orders and goods receipt**, supporting receiving goods **before** the supplier invoice arrives — recorded against an internal memo/delivery challan, reconciled later when the actual invoice arrives. Do not force "invoice-first" receiving into the schema.
- **Supplier returns** recorded as a ledger entry, linked back to the original purchase voucher — not a free-floating credit note.
- **Delivery challans support partial deliveries** against a single order.
- **Invoicing from challans**: an invoice can be raised from one challan or multiple combined — staff need a UI to pick line items across multiple challans onto one invoice. This needs a defined UX path, not something bolted on later.

### 6.4 Accounting & Reports
- **Separate chart of accounts and ledgers per entity** (KT vs KA), with a combined owner-level view across both.
- **Customer/supplier ledgers**: invoice-wise settlement for corporate (KT) customers, running balance for others.
- **FBR POS integration** scoped to KT workstations only.

---

## 7. Core data model — full field-level detail

*Derived directly from the client's own handwritten planning notes (source-transcribed, not summarized) — treat this as closer to source-of-truth than general discovery conversation for these specific entities.*

### 7.1 Item Form (Form "A") — the base sellable/stockable unit

The client's notes letter each field individually (a through i) — this exact lettering matters because §7.2 (Items/Markers Control Form) refers back to it directly:

| Letter | Field | Notes |
|---|---|---|
| a | Item Code | System auto-generated. Explicitly noted as **could be used as a barcode in future** — design the code format now with barcode-symbology compatibility in mind |
| b | Part No | Editable, supports creating new entries |
| c | Brand | Dropdown / scroll-down list |
| d | Origin | Must enforce **no duplicate entry**; supports print-or-search by name |
| e | Class | — |
| f | Engine Info | — |
| g | Model | — |
| h | Size | — |
| i | Control Part No. | Selected from a panel — a lookup/picker into the Control Part Form (§7.3), not free text |

Unlettered / system fields on the same form: **RPP** (auto-populated from system), **SAP** (auto-populated from system), **Safety Stock Days** ("total days for stock safety" — feeds the Stock Ordering Module, §7.6), **Print Name** (system auto-composed as `Class + Part No + Brand`; needs further discussion re: wording and interaction with stock movement reports — don't assume this composed string is final).

**Search & lookup behavior:**
- **Search layout 1**: `Class + Part No + Origin + Brand + Engine Info` — the standard multi-field search combination staff will use.
- **History layout**: item-level history keyed on Control [Part] # (or qty — handwriting ambiguous, `[unclear — confirm: "Control # or qty"]`), showing sale/purchase type, party name, date, number of items, and sale price.

### 7.2 Items/Markers Control Form (Form "1A") — distinct from Control Part Form
> **This is a separate entity from the Control Part Form (§7.3) — the client's own notes flag confusion between the two and mark it as needing discussion. Do not merge them in the schema without confirming.**

- Governs fields **a) through h)** of Form A (Item Form) — i.e., **all the lettered dropdown/pick-list fields except Control Part No. (i)**. That exclusion makes sense: Control Part No. is a lookup into a separate form (§7.3), not a dropdown value this form would manage. So 1A is the master-data screen for Item Code, Part No, Brand, Origin, Class, Engine Info, Model, and Size — confirmed directly against the source notes.
- Framed by the client as: *"from where the person using/creating an item will use [a] scroll-down [of] information"* — an admin screen where those dropdown option lists are defined and maintained.
- Also covers creation of sub-fields a(i) through a(vii) — likely referring to the Control Part Form's own sub-fields rather than Item Form's, based on numbering. **This is exactly the ambiguity the client flagged**: *"discussion required how to handle in relation to Form B [Control Part Form]."*
- Supports editable/new (global convention, §8).
- **Action item**: before finalizing inventory schema, get the client to walk through a concrete example — is this a generic "manage all dropdown lists" admin screen, or specifically about managing Control Part sub-field values? Current notes support either reading.

### 7.3 Control Part Form (Form "B") — vehicle fitment/compatibility record
The backbone of the vehicle-compatibility search feature.

**Fields under "Control Part Number":**

| # | Field |
|---|---|
| i | Model name |
| ii | Frame/Engine name |
| iii | Year From |
| iv | Year To |
| v | Engine capacity / CC |
| vi | Transmission |
| vii | Engine Fuel |

**Behavior:**
- **One-to-many fitment lines**: a single Control Part can have more than one line — client explicitly estimates **10–15 lines or attachments in some cases**. Design the fitment child table for this volume as the norm.
- **Manual attachment requirement**: must be an option to manually attach a Control Part Number to multiple individual inventory Items — this linkage is explicitly manual, not inferred.
- Supports editable/new; uses the F1–F9 search shortcut pattern.

**Search layouts specific to Control Part:**
- **Search layout 2**: if any individual part number (an Item) is searched, all Items should appear based on the Control Part Number attached to the searched part — the cross-variant visibility behavior.
- **Search layout 3**: explicitly deferred — *"to be used in future, based on (a) above"* — a third search mode building on the Control Part Number fields, not yet specified. Don't build in v1; leave an extension point.

### 7.4 Deal Part Form (Form "C") — bundling layer
- Described by the client as a **"subsidiary record."**
- Two or more individual Items are combined; a new name for the combination is given — becomes the Print Name used on Quotation/DN/Sales Invoice when the bundle is selected.
- **Print Name for Deal Part is manually added** — different from Item Form's Print Name, which is system auto-composed. Client explicitly crossed out "auto" and wrote "manually added" for Deal Part's print name. **Do not reuse the same print-name-generation logic between Item and Deal Part.**
- **Stock movement** for a Deal Part sale is accounted exactly as it would be for the individual items underneath — the bundle itself never holds stock.
- **Pricing (RPP/SAP/sale price) is decided at the time of sale**, inside the sale module — not fixed on the Deal Part definition. Do not cache/store an authoritative bundle price at definition time.
- System must keep a full record of RPP/SAP/sale price for every Deal Part transaction, since pricing is decided per-sale.
- Uses F1–F9 search pattern; **Search layout 4** = search Deal Items by print name.

### 7.5 Party Form (Form "D") — customers & vendors

**Fields:**
- Name
- GST No
- NTN No
- Telephone no — **supports 1 to 5 phone numbers** per party
- **Status of Party** (commercial tier): `C1` Corporate / `C2` Retail-Counter *(client wrote "O2" — almost certainly a handwriting slip for "C2," confirm but treat as 3-option enum)* / `C3` Wholesale
- **Nature of Party** (ledger/account category): `S1` Vendors/Suppliers A/C / `S2` Market Supplier A/C / `S3` Customer Receivable A/C
- **Print Name**: defaults to same as Name, unless edited — simplest of the three "print name" patterns in the system.

**Design implication**: Status and Nature are two independent classification axes, not one field — every Party record needs both a Status code (C1/C2/C3) and a Nature code (S1/S2/S3). Drives pricing tier, discount display logic, and which ledger account family a party posts against.

### 7.6 Stock Ordering Module (Form "E")
> New module, only in handwritten notes, marked "**Detail Discussed**" (underlined) — meaning this had already been talked through in more depth than the shorthand suggests; worth a follow-up to recover full detail.

- Ordering suggestions based on **Safety Stock [Days]** (Item Form field) — system should flag/suggest items needing reorder based on current stock vs. configured safety stock threshold.
- **Report generation at any given point** — runnable on demand, not just scheduled.
- **Option to add ordered quantity + supplier + price** directly from this module — implies it can feed into/initiate a purchase order, letting staff record what's been ordered, from whom, at what price, right from the reorder screen.

### 7.7 Stock Adjustment Form (Form "F")
> New module, only in handwritten notes, also marked "Detailed Discussion."

- Selection of Item Code — staff picks the item to adjust.
- System shows current quantity automatically on selection.
- Staff enters adjustment quantity, positive or negative.
- **Comments field**, described as "detailed" — implies a required/substantial free-text justification, not optional. Likely for audit purposes (shrinkage, damage, recount corrections) — treat as mandatory in the UI.
- **On posting, SAP is to be adjusted** — confirm exact meaning of "SAP" (Glossary, §12), but client is explicit this pricing/reference field updates as a *consequence* of a posted stock adjustment.

### 7.8 Authority Levels / Form (Form "G")
> New module, only in handwritten notes, given the least detail of any section — a single line: **"Authority levels / Form,"** no further elaboration.

Based on context (margin-override approvals, stock adjustment posting, invoice posting/unposting) this is almost certainly a role/permission system — defining which staff roles can post/unpost documents, approve margin overrides, authorize stock adjustments, etc.

**This is the least-specified module in the entire notes set and needs a dedicated requirements conversation before any schema or permission-model work begins.** Do not infer a full RBAC design from a single line — confirm scope, granularity (per-module? per-action? per-document-type?), and whether this maps to the staff/employee-code linking question (also open, see §9 item 2).

**Status of the Authority Levels scoping conversation, as of the latest session:**
- Confirmed: scope is **global**, not per-entity — one role applies across both KT and KA.
- Confirmed: controls **both** approval authority (who can authorize actions) **and** access control (who can see/use what).
- Still needs client input: (1) who are the actual people/roles today — real names and responsibilities, not abstract titles; (2) what specifically needs sign-off before it happens vs. (3) what only needs after-the-fact visibility; (4) who can see margin/cost data vs. just sale price; (5) does authority enforcement need to work offline, and can a cashier bypass something while disconnected.
- Starting proposal to bring to the client (framed as "here's the plan unless you tell us otherwise"): **Owner/Admin** (everything, sees cost/margin), **Manager** (approves discounts/refunds/voids, sees margin), **Cashier/Staff** (sales entry only, no discount/refund without approval, no cost visibility).

---

## 8. Sales documents — field-level detail

Document sequence: **Quotation → Delivery Note (DN) → Proforma Sales Tax Invoice / Sales Tax Invoice**

### 8.1 Quotation
- Different formats for KA and KT (separate letterhead/layout per entity).
- Fields: Name, Customer Ref, Date of Quote, Our Ref No., Vehicle Details, P.O. No., Customer GST/NTN No. (auto-filled from Party record), Validity (quote expiry), Sales Tax/other taxes.
- Gross price is inserted by staff; system breaks it down into tax components.
- Overall layout of Quotation/DN/Sales Invoice meant to stay consistent, minor changes only between document types — build one shared print-template component with per-document-type variations, not three separate templates.
- **A Quotation is explicitly "just a subsidiary record and requires no accounting"** — zero ledger/accounting impact. The one document in the chain that does not follow the post/unpost pattern the same way (informational only).
- Supports new/editable.

### 8.2 Delivery Note (DN)
- Same base fields as Quotation, **plus Quotation No.** (linking back to source quotation, if one exists).
- **Selection of items happens individually** — staff pick specific line items to carry onto the DN, not necessarily the whole quotation.
- **Two format variants per DN, per entity** — effectively KA-with-price, KA-without-price, KT-with-price, KT-without-price.
- Editable/new, post/unpost.
- **DNs can be prepared directly as a first step** — staff don't have to start from a Quotation.
- Gross price added → system breaks it down (same rule as Quotation).

### 8.3 Proforma Sales Tax Invoice / Sales Tax Invoice
- Same base structure as DN, **plus DN number(s)** the invoice is drawn from.
- **Selection of individual items from the DN(s)** — not necessarily the full DN.
- **Two print formats**: Invoice format and Bill format (for sales tax purposes) — confirms "Bill Invoice" and "Sales Invoice" are the same underlying document, differing only in printed label/format.
- Post/unpost/editable/new-invoice states all apply.
- **New invoices can also be generated directly** (bypassing Quotation/DN entirely).
- **Merging/adding the same item from different DNs onto one invoice** must be supported — if the same part appears across two separate delivery notes, the invoice-creation flow needs to let staff combine those lines.
- **Manual control over line sequencing/serial numbering** for print purposes, identical across Quotation/DN/Sales Invoice.
- **Print Name behavior**: editable override on screen, saved version prints — identical across all three document types.

---

## 9. Vouchers & Ledgers (Accounting)

- **Ledgers** (general).
- **Offsetting against invoices** — payments/receipts matched/offset against specific invoices, consistent with invoice-wise settlement for KT customers.
- **Voucher types** (three, bracketed together in client's notes as a set):
  1. Bank/Cash Receipt Voucher
  2. Bank/Cash Payment Voucher
  3. Journal Voucher
- **For each voucher, there are two types** — most likely Sales Tax and Income Tax variants (client's notes literally read "Sales tax and income tax" on the next line), though this reading needs confirming before building two parallel voucher schemas.
- Vouchers should be presented in listable/selectable table views (consistent with "System screen listings" in Reports below).

---

## 10. Reports — full list (from client's own notes, page 9)

This is more detailed and **more authoritative** than the shorter list from general discovery — treat as the v1 report scope:

1. Ledgers
2. Offsetting against invoices
3. Bank/Cash Receipt Voucher report
4. Bank/Cash Payment Voucher report
5. Journal Voucher report *(items 3–5 grouped by client as a set, each further split into Sales Tax / Income Tax variants — see §9)*
6. Closing/Ageing reports — Receivable and Payable
7. Party Itemized Report — period-wise
8. Stock Reports — movement, pricing, itemized and collective views
9. System screen listings — Quotation/DN/Invoice, purchases/other vouchers (browsable/filterable list views of every document type, not just printed reports)
10. Daily Operational Report — Cash/Bank
11. Employee Code linking — explicitly marked **"to be discussed"** by the client (same open item as §9 item 2 — recurs here in the reports context, meaning report rows likely need attribution to staff once the linkage design is settled)
12. Trial Balance / Financial Statements
13. Status-wise and Nature-wise P/L and Balance Sheet — sliceable by Party Status (C1/C2/C3) and Nature (S1/S2/S3) codes, in addition to per-entity (KA vs KT) split

**The client's own notes end this page with "Details to be continued"** — treat this list as a snapshot, not final.

*(This supersedes the shorter discovery-conversation report list: daily sales, stock valuation, receivables ageing, part-wise sales, margin-override log. Reconcile: "part-wise sales" and "margin-override log" don't appear verbatim in the notes list above — confirm whether they fold into "Stock Reports"/"System screen listings" or are still separately required.)*

---

## 11. System-wide conventions (from client notes — apply everywhere)

Global rules the client wrote at the top of their notes, meant to apply across every form/module, not just one:

- **Branding**: logo of both KA/KT entities plus one shared address must appear on ledgers/printed documents.
- **Language**: all system text/labels in **CAPS**. Scope unconfirmed — likely printed documents and key labels, not necessarily every UI microcopy string; clarify before hard-coding as a global CSS rule.
- **Editable/New state pattern**: nearly every form is annotated `editable`/`new` — each form must support both creating and editing through the same interface, not separate screens.
- **Post/Unpost pattern**: applies to all transactional documents (Quotation is the one exception — see §8.1). A document can be posted (finalizes stock/accounting effect) or unposted (reverses it, allows correction).
- **Function-key search shortcuts (F1–F9)**: referenced repeatedly next to search/lookup fields across multiple forms. Client expects keyboard function-key shortcuts for search/lookup panels throughout — consistent with legacy desktop ERP/POS conventions and the "non-technical staff, fast counter operation" requirement. Build one shared, reusable search/lookup component, not one-off implementations per form.
- **Print Name pattern**: system-composed with editable override, final saved version is what prints — applies uniformly across Quotation, DN, Invoice.

---

## 12. Glossary

| Term | Meaning |
|---|---|
| DN | Delivery Note |
| RPP | Reference/Retail Purchase Price — auto-populated field on Item Form; exact business definition still needs confirming with client |
| SAP | A sale-price reference field auto-populated on Item Form, explicitly adjusted on posting a Stock Adjustment — **not** related to SAP the ERP vendor. Exact business definition still needs confirming |
| KT | Kiyan Traders (corporate entity) |
| KA | Kiyani Autos (retail entity) |
| Control Part | The canonical fitment record (Form B) grouping all origin-variants of functionally the same part |
| Deal Part | A sales-time bundle (Form C) of 2+ individual items sold/printed under one manually-set name |
| Items/Markers Control Form | Master-data/dropdown-management form (Form 1A), exact relationship to Control Part Form unresolved — see §7.2 |
| Post/Unpost | Document state controlling whether a transaction has taken its final stock/accounting effect |
| F1–F9 | Function-key shortcuts referenced throughout for search/lookup panels |
| Search layout N | The client's own numbering for named search/query modes on a given form |

---

## 13. Non-functional requirements

| Requirement | Detail |
|---|---|
| Offline-first | Shop must remain fully operational (billing, stock movement) during internet outages of hours to days |
| No data loss / no double-sell | Multi-terminal offline operation must not allow two counters to oversell the same stock unit without reconciliation |
| UX simplicity | Non-technical, blue-collar staff — large touch targets, minimal typing, fast barcode-first flows, function-key search shortcuts |
| FBR compliance | 24-hour offline invoice queue under SRO 288/2026 |
| Two-entity separation | Books, ledgers, chart of accounts separable per entity while inventory stays pooled |
| Auditability | Post/unpost states, mandatory adjustment comments, margin-override logging, clean transaction history all explicit client requirements — not an afterthought |
| Branding consistency | Both entities' logos + shared address on ledgers; CAPS-styled system language, scope to confirm |

---

## 14. FBR (Federal Board of Revenue) Integration

- **Scope**: Kiyan Traders workstations only — three confirmed workstations. Kiyani Autos does not need FBR integration.
- **Legal basis**: SRO 288/2026 — FBR's framework anticipates unreliable connectivity. Offline invoices are explicitly permitted: generated/printed locally, must be uploaded to FBR within **24 hours** of connectivity returning.
- **Architectural implication**: dedicated `fbr_queue` table, decoupled from general cloud sync, with its own retry worker. FBR submission should not be blocked/delayed by unrelated sync traffic. Its own status tracking (queued → submitted → acknowledged/failed), with alerting if the 24-hour window is at risk.
- Do not treat FBR integration as a checkbox on the general invoice model — it needs its own queue, status tracking, and alerting.
- FBR API sandbox access requires **client-side registration** for credentials — this is a client dependency, not something Mehmoon can unblock alone.

---

## 15. Data migration (scoped and priced separately)

- Not part of the core build in terms of process — a short data assessment still needs to happen before migration work starts, even though migration cost is bundled into the overall project rather than billed separately.
- **Outstanding balances** must migrate correctly but not uniformly: Corporate (KT) customers migrate invoice-wise, preserving existing invoice-level structure; everyone else migrates as a standalone running balance.
- Confirm before migration starts: what system client is currently on (named software vs. Excel), DB access vs. exports only, how much history to migrate (full vs. last 1–2 years), whether KT/KA data is already cleanly separated in the old system or mixed together.

---

## 16. Account & infrastructure setup (completed)

To keep the delivered system cleanly separable from personal accounts, a dedicated client-identity account stack has been created:

- **New Gmail** (neutral, non-AI-branded name) — anchor identity for the project.
- **GitHub** — new private repo created under this identity, client-neutral name (not PLYXIO-branded), PLYXIO/personal GitHub added as collaborator/admin.
- **Vercel** — new account under this identity, collaborator access added.
- **Supabase** — new account under this identity, collaborator access added. (Claude has a direct Supabase MCP connector, enabling project creation, migrations, and cloud DB management directly within conversation — worth using once the new account's Supabase project needs setup.)
- **Claude** — new account under this identity, for headroom on this project separate from Mehmoon's other work. This document is the context transfer for that account.

**Rationale**: clean handover at project end (password reset, not account/repo transfers); keeping AI-tool usage invisible to the client if they ever review project assets (no "Claude"-branded emails, no shared workspace access, clean commit messages/docs without AI-generated boilerplate).

---

## 17. Key learnings & principles

- **Offline resilience is the core architectural constraint** — drove Local + Cloud over Cloud Only.
- **Free-tier Vercel/Supabase are not suitable** (see §4).
- **Migration must be bundled into the project, not treated as a separate billable add-on** — this was a firm client preference.
- **Scope trimming is the preferred lever** if the client pushes back on cost, not underpricing.
- **Source fidelity over polish** in documentation — flag ambiguities inline (`[unclear — confirm]`) rather than cleaning them up or guessing. The first documentation draft, built from a summary of the client's notes rather than the notes themselves, missed three entire modules (Stock Ordering, Stock Adjustment, Authority Levels) — always go back to source material, not a prior summary of it.
- **`read_conversation` cannot retrieve image attachments** from prior chats, only text summaries written at the time. If image-based source material (e.g. photos of handwritten notes) is needed again, request re-upload into the active conversation.
- **Hugging Face model downloads are blocked** in the sandbox (network allowlist covers PyPI/GitHub but not huggingface.co) — don't attempt Whisper or other HF-hosted transcription there.
- **Don't let "basic app" scope quietly exclude compliance-critical pieces** (FBR, offline sync) under a "fine-tuning" label — these need to work end-to-end in the core phase, not be deferred.

---

## 18. Working style & communication preferences

- **Direct, single-number answers** preferred over detailed breakdowns for pricing/recommendations.
- **Cautious and deliberate** on client commitments — always wants to review/adjust before sending, prefers buying time over committing under pressure (e.g. replying "I'll get back to you tomorrow" rather than responding to a proposal immediately).
- **No-nonsense client communication style** — Pakistani business tone for client-facing docs, no AI-sounding language, no dashes in prose.
- Mehmoon makes **direct edits to documents himself** (uploads modified versions) — these become the new working base; preserve those changes, don't revert them.
- Claude's role spans: sounding board for client management decisions, drafter of client communications, technical architect, documentation writer, and active co-developer.
- Recommendation on record: use **Claude Code (desktop)**, not the chat interface, for active coding phases — real file management, git history, test iteration.

---

## 19. The 14 open questions checklist — do not silently resolve any of these in code

| # | Question | Source | Affects |
|---|---|---|---|
| 1 | Exact relationship between Items/Markers Control Form (1A) and Control Part Form (B) — does 1A manage Item Form dropdowns, Control Part sub-fields, or both? | Client notes, pg. 3 | Inventory schema (§7.2, §7.3) |
| 2 | Employee Code linking — how staff attribute to transactions/reports works | Client notes, pg. 1 & 9 | Reports (§10), Authority Levels (§7.8) |
| 3 | Full scope and granularity of the Authority Levels module | Client notes, pg. 1 | Permissions/RBAC across entire system — see §7.8 for current scoping status |
| 4 | Full detail behind Stock Ordering Module (E) and Stock Adjustment Form (F) — both marked "Detail(ed) Discussed" but notes are shorthand | Client notes, pg. 1 | Inventory ordering & adjustment workflows (§7.6, §7.7) |
| 5 | Confirm "Status of Party" codes — notes show C1/O2/C3, likely a handwriting slip for C1/C2/C3 | Client notes, pg. 6 | Party schema (§7.5) |
| 6 | Confirm "two types per voucher" really means Sales Tax / Income Tax variants | Client notes, pg. 9 | Voucher/ledger schema (§9) |
| 7 | Reconcile the shorter discovery report list (part-wise sales, margin-override log) against the client's own longer, more authoritative report list | Client notes, pg. 9 vs. discovery | Reports module (§10) |
| 8 | Is the linked/complementary item suggestion (clutch plate + pressure plate) manual or system-inferred? | Discovery | Inventory (§6.2) |
| 9 | Is margin limit per category, per item, or one global limit? Does an override need admin approval or just a click-through? | Discovery | Sales rule engine (§6.1) |
| 10 | Unified Electron (terminal doubles as server) vs. dedicated always-on server process? | Architecture discussion | Architecture (§4) |
| 11 | Current system name/format for migration; DB access vs. exports only; how much history to migrate; is KT/KA data already cleanly separated in the old system | Discovery | Data migration (§15) |
| 12 | Can a single sale be split across multiple settlement channels? | Discovery | Sales/accounting (§6.1) |
| 13 | Exact business definitions of RPP and SAP | Client notes throughout | Item Form, Stock Adjustment (§7.1, §7.7) |
| 14 | "Details to be continued" — client's own note suggests the Reports list is not final | Client notes, pg. 9 | Reports module (§10) |

**Rule**: where a decision is needed to keep moving, implement the most reversible/configurable option and flag it clearly in code comments and PR descriptions as "pending client confirmation."

---

## 20. Where things stand right now / immediate next steps

1. **Advance payment received. Project timeline is officially live.** ✅
2. **Package confirmed: Local + Cloud (offline-first).** ✅
3. Client-identity accounts (Gmail, GitHub, Vercel, Supabase, Claude) are set up and collaborator access granted. ✅
4. New GitHub repo created under the client identity. ✅
5. Authority Levels scoping is **in progress** — see §7.8 for exactly what's confirmed and what still needs a conversation with Ghaus Kayani.
6. **Per the build timeline, Phase 1 (discovery wrap-up, UI/UX design and prototype, review of existing system workflows) is the next phase to start.** This does not require Authority Levels or all 14 open questions fully resolved first — it's largely design/prototype work, not schema-committing work.
7. Schema design should hold off on Authority Levels-dependent tables until that conversation happens, but can proceed on uncontested areas (items/inventory, basic customer/vendor tables, sales/purchase document structures) in parallel.
8. FBR API sandbox access requires the client to register for credentials — client-side dependency.
