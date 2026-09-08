# Kayani ERP — Full Project Export

*Generated for migration out of Claude Projects into Claude Code. Covers: project instructions status, full verbatim knowledge files, chat-only context not saved anywhere else, and known gaps/contradictions. Received from Mehmoon 2026-09-08; the referenced "FILE 1 of 2" is `kayani-erp-project-handover.md` (also in this folder) and "FILE 2 of 2" is reproduced inline below as it was too short to warrant its own file.*

---

## 1. PROJECT INSTRUCTIONS (custom system prompt)

**Not recovered.** The planning-account Claude reported it has no tool access to reproduce the Project's custom-instructions field verbatim — only to its knowledge files and running conversation memory. If that field contains anything not reflected in the knowledge files or in this export's §3/§4, it has not been captured anywhere and would need to be copied manually from Claude.ai Project settings.

---

## 2. PROJECT KNOWLEDGE FILE 2 of 2: chart of accounts (client-provided, 2026-09-07 spreadsheet)

In-Project file label: `claude/chart-of-accounts.md`. Source: `chart of accounts.xlsx`, sent by the client, 2026-09-07.

### Chart of Accounts

**Non-Current Assets**
- Shop at Cost
- Vehicles at Cost
- ERP, Computer & Hardware

**Current Assets**
- Parts Inventory Stock
- Parts Sold but not Invoiced Yet (Un-invoiced delivery challans)
- Security Deposits Account
- Customer Receivable Account
- Cash in Hand
- Easypaisa Account
- Jazz Cash Account
- AFL1 Kiyan Traders Others 3390
- AFL2 Kiyan Traders AGPR 8726
- AFL Kiyani Autos 2478
- AFL Kiyani Autos 8727
- FBL Kiyani Autos 5050
- JS Kiyan Traders

**Equity & Reserves**
- Acquisition Cost Account
- Retained Earnings Account
- Provision for Parts inventory stock at LPP
- Income Tax Payable Account
- GST Payable Account
- Drawings Account

**Current Liabilities**
- Supplier Payable Account
- AFL Short Term Loan

**Income/(Loss) Account**
- Sale Income Account (net of sale returns) — *status of party-wise*
- GST Withheld/Payable Account — *status of party-wise*
- Income Tax Withheld/Payable Account — *status of party-wise*
- Other Income Account
- Cost of Good Sold (net of returns) — *status of party-wise on the basis of LIFO*
- Current provision for Parts inventory stock at LPP
- Freight & Transportation Cost Account
- Discount Expense Account (Net)
- Business Expense Account
- Stock Adjustment Account (Net)
- Salaries & Wages Expense Account
- Travelling Expense Account
- Telephone, Electricity & Water Expense Account
- Kitchen Expense Account
- Miscellaneous Expense Account

### Reports Needed (formats to be discussed later — few essential reports, not all)

1. Account Ledger invoice-wise
2. Account Ledger invoice-wise
3. Account ledger (pending receivables/payable invoices) with aging
4. Invoice-wise cost, sale value and profit %age and amount
5. Stock itemized qty and cost movement to closing balances
6. Stock itemized sold qty + value and %age profit + amount
7. Stock movement report (opening + purchases – cost of sale + closing)
8. Stock report on the basis of LPP ignoring zero/negative qty balance
9. Stock itemized report falling below min defined qty
10. Balance Sheet
11. Income statement with status of party classification
12. Cash flow statement
13. Business Performance and Continuity Ratios
14. Daily closing report (total sale, credit sale, account receipt sale, cash receipt sale etc.)
15. Daily itemized report where sale price is less than 7% or higher than 15%, showing invoice-wise items, LPP, sale price
16. Un-invoiced Delivery Challans Report (date, number, party/PO no, vehicle details, amount)
17. Un-invoiced Delivery Challans Report (date, number, party/PO no, vehicle details, amount) with items
18. Listing screen for invoices/quotations/delivery challans (date + party name + invoice no + PO number/vehicle details, etc.)
19. Dashboard for owner

### Vouchers Needed

1. Cash receipt voucher
2. Bank receipt voucher — *banks + wallets*
3. Bank payment voucher — *banks + wallets*
4. Cash receipt voucher against invoice
5. Bank receipt voucher against invoice — *banks + wallets*
6. Bank payment voucher against invoice — *banks + wallets*
7. Journal voucher — *manual selection of debit/credit*
8. Journal voucher against invoice — *manual selection of debit/credit with invoice*
9. Stock adjustment voucher — *addition/deletion of qty at LPP with predefined account codes*

---

## 3. CONVERSATION CONTEXT NOT CAPTURED IN THE KNOWLEDGE FILES

The following points come from the planning-account Claude's running memory of past chat sessions in that Project. None of them are written into the two knowledge files above. Some overlap with file content but add detail the files don't have; those are marked accordingly.

### 3.1 Client contact channel
Ghaus Kayani's primary channel is WhatsApp specifically (the handover file says this too, but worth restating since it's the operative channel for any client-facing item).

### 3.2 The "14 open questions" are tracked slightly differently in chat memory than in the file
The handover file's §19 table lists 14 items with sources and what they affect. The planning account's working memory groups the same territory into 5 flagged "active unresolved conflicts" plus a rolled-up "14 known open items" bucket. The two groupings mostly overlap, but memory adds two conflicts that are *not* named as such in the file:

- **Two non-matching Chart of Accounts versions exist across planning sources.** A real, identifiable conflict — see §4.1 below for the specific line-by-line diff, since neither knowledge file states this explicitly as a conflict.
- **Three non-matching Reports/Vouchers lists exist across planning sources** — the handover file's §10 list (13 items, from client notes pg. 9), the chart-of-accounts file's "Reports Needed" list (19 items) and "Vouchers Needed" list (9 items), and the shorter original discovery-conversation list mentioned only in passing inside handover §10 (daily sales, stock valuation, receivables ageing, part-wise sales, margin-override log). The handover file's own text acknowledges the discovery list only loosely; it does not treat the chart-of-accounts file's list as a third version. Flagging it as such is chat-only.

### 3.3 A second, more specific candidate structure for Authority Levels (Form G)
The handover file's §7.8 only records **one** starting proposal: Owner/Admin, Manager, Cashier/Staff (three-tier).

Chat memory holds a **second candidate structure that is not in either file**: a five-role model — **Counter Control, Corporate Control, Receipts/Payments Control, Inventory Control, Management Control**. This was discussed as an alternative to the three-tier proposal. Since the file only has one of the two candidates, treat the five-role model as something that would be lost if migrating from the file alone.

### 3.4 Explicit reasoning on LIFO costing (elaboration beyond what's in the files)
The chart-of-accounts file mentions COGS is "on the basis of LIFO" but doesn't say anything about implementation risk. Chat memory has this as a standing engineering note: **LIFO costing must be explicitly implemented in the inventory engine — it does not fall out of standard ORM or inventory-library defaults.** Whoever builds the costing layer needs to treat this as a deliberate build task, not an assumption that a generic inventory package will handle it.

### 3.5 Explicit reasoning on entity separation being application-layer only
Handover §6.4 and §13 state that KT/KA need separate ledgers/chart of accounts. Neither file explicitly says *how* that separation is implemented relative to the underlying data. Chat memory has an explicit architectural note that isn't spelled out in either file:

> The client-provided COA is flat/unsplit except at the bank-account-name level (e.g. "AFL Kiyani Autos 2478" vs "AFL2 Kiyan Traders AGPR 8726"). All KT/KA ledger/reporting separation must be handled at the application layer — do not assume structural separation exists in the source data.

This is a load-bearing implementation note for anyone building the accounting schema.

### 3.6 Explicit reasoning on permissions being runtime-configurable
Handover §7.8 describes the Authority Levels module and gives a starting three-role proposal, but doesn't state a schema constraint. Chat memory has this as an explicit rule: **do not hardcode role names or a fixed role count in the schema — the admin must be able to create arbitrary roles at runtime.** This applies regardless of which of the two candidate role structures (§3.3 above) the client eventually confirms.

### 3.7 Working principle: "scope trim, not price cut"
This phrase appears in handover §17 in slightly different wording ("Scope trimming is the preferred lever if the client pushes back on cost, not underpricing"). Same principle, restated for completeness.

### 3.8 Working principle: knowledge audits before continuing build
Chat memory records a working rhythm not described in either file: **periodic knowledge audits are run before continuing build work, and during those audits Claude/Claude Code must not fill gaps or resolve ambiguities silently** — same "flag, don't guess" rule as elsewhere, tied to a recurring audit step in the process.

### 3.9 Correction-handling convention
Chat memory has a specific process note not in the files: **when Mehmoon corrects a Claude output, Claude should confirm back explicitly what changed versus what was already present** — restate the delta so both sides know exactly what shifted, rather than silently accepting a correction.

### 3.10 Preferred tool for active coding
Handover §18 already states Claude Code (desktop) is preferred over chat for active coding phases.

---

## 4. GAPS AND CONTRADICTIONS (flagged, not resolved)

### 4.1 Chart of Accounts: two non-matching versions exist. Do not merge without client confirmation.

The handover file doesn't contain its own COA — it only references one existing conceptually. The planning account's memory holds a COA version (presumably from an earlier client source, predating the 2026-09-07 spreadsheet) that differs from the knowledge file's version (§2 above) in specific, listable ways:

**In the memory-held earlier COA version but NOT in the 2026-09-07 file's COA:**
- "Softwares/Computer & Hardware" (the file instead has "ERP, Computer & Hardware" — likely the same line item, reworded, not a true addition/removal, but the wording differs and "ERP" appearing in an account name is worth confirming with the client is intentional)
- "Income Tax Withheld" and "GST Withheld" listed under Current Assets (the file instead places "Income Tax Withheld/Payable Account" and "GST Withheld/Payable Account" under **Income/(Loss)**, marked status-of-party-wise — a structural difference, not just wording: same accounts, different section of the COA)

**In the 2026-09-07 file's COA but NOT in the memory-held earlier version:**
- "JS Kiyan Traders" (an additional bank account, under Current Assets)
- "Provision for Parts inventory stock at LPP" (under Equity & Reserves)
- "Current provision for Parts inventory stock at LPP" (under Income/(Loss) — a *different* line from the Equity one above, both exist in the file)
- "Income Tax Payable Account" and "GST Payable Account" under Equity & Reserves (distinct from the Income/(Loss)-section Withheld/Payable accounts noted above — the file has what looks like two separate sets of tax-payable-style accounts in two different sections; worth flagging to the client as a possible duplication rather than assuming it's intentional)
- "Travelling Expense Account" (under Expenses)

**Assessment (stated plainly rather than silently picking a version):** the file is dated 2026-09-07 and is explicitly sourced from a client-sent spreadsheet, which makes it the more likely candidate for "most current." But the planning account is not certain the memory-held version is stale rather than representing a different, still-relevant source (e.g. an earlier verbal walkthrough that hasn't been formally superseded). **Do not treat the 2026-09-07 file as automatically authoritative — confirm with Ghaus which version to build against.**

**Note (added when reconciling against the Claude Code repo, 2026-09-08):** the CLAUDE.md/schema already built in this repo uses a *third*, shorter version of the COA (e.g. "Income Tax Withheld" / "GST Withheld" under Current Assets like the memory-held version, but without "Security Deposits," "JS Kiyan Traders," the LPP provision accounts, "Travelling Expense," or the party-wise/LIFO annotations). This is now a **three-way** conflict, not two-way. See CLAUDE.md open questions.

### 4.2 Reports/Vouchers lists: three non-matching lists, not reconciled anywhere
Three separate reports lists (handover §10, chart-of-accounts file's "Reports Needed," and the discovery-era shorter list referenced only in passing inside handover §10's closing note) and at least two vouchers lists (handover §9's three-type/two-variant description, and the chart-of-accounts file's 9-item "Vouchers Needed" list, which is more granular — e.g. it splits "against invoice" as its own line per voucher type, which the handover file's description doesn't do explicitly). None of the source material declares one of these authoritative over the others.

### 4.3 Authority Levels: two candidate structures exist, only one is in the saved file
See §3.3 above — the five-role candidate (Counter Control / Corporate Control / Receipts-Payments Control / Inventory Control / Management Control) exists only in chat memory, not in the handover file's §7.8.

**Note (added when reconciling against the Claude Code repo, 2026-09-08):** this repo's CLAUDE.md and the already-built/seeded RBAC schema (`src/db/schema/users.ts`, seeded via `src/db/seed.ts`) committed to the five-role candidate, worded as "confirmed," before either candidate had actual client sign-off per this export. This needs revisiting — see CLAUDE.md open questions and DECISIONS.md.

### 4.4 Nothing in the files or memory indicates the "14 open questions" have been resolved
As of this export, all 14 items in handover §19 and all "active unresolved conflicts" in memory remain open.

**Update (2026-09-08):** one of them has since been effectively resolved by client feedback given directly to Mehmoon in the Claude Code session — see CLAUDE.md/DECISIONS.md: discounts are itemized for Kiyani Autos only, net-of-discount pricing (no separate line) for Kiyan Traders. This matches handover §6.1 exactly and corroborates it.

### 4.5 Project instructions field — status unknown
See §1. If the Project's custom instructions field contains rules that duplicate or conflict with anything above, that has not been checked from within the Project chat itself.

---

## 5. Suggested next step (from the original export)

Once the "Project instructions" field is copied manually (§1), this document plus the handover file should be everything needed to seed context in Claude Code with nothing lost. The flagged version conflicts (§4.1 COA, §4.2 Reports/Vouchers, §4.3 Authority Levels roles) are genuine open items, not migration artifacts — they were already unresolved before this export and should go on the list of things to settle with Ghaus regardless of which tool is used to build.
