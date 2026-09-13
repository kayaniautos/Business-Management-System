import { eq } from "drizzle-orm";
import { db } from "./client.js";
import { chartOfAccounts } from "./schema/accounts.js";

/**
 * A proposed numbering scheme for the chart of accounts (CLAUDE.md
 * section 4: the client confirmed coding must be "expansion-ready" but
 * never supplied or was asked for an actual scheme). This is Mehmoon's
 * own proposal, not a client-confirmed numbering convention —
 * `[unclear — confirm]` before treating these exact codes as final; the
 * client may want different block sizes, a different digit count, or to
 * start block numbering from a different base.
 *
 * One 1000-wide block per confirmed top-level category (in the same
 * order the client's own spreadsheet lists them), each account spaced
 * ten apart within its block:
 *   1000s Non-Current Assets, 2000s Current Assets, 3000s Equity &
 *   Reserves, 4000s Current Liabilities, 5000s Income/(Loss).
 * Ten-apart spacing (1010, 1020, 1030...) leaves 9 unused codes between
 * every pair of existing accounts for something inserted later, and each
 * 1000-wide block holds up to 99 accounts before running out of room —
 * comfortably "expansion-ready" for a chart of accounts with 40 rows
 * today. The five bank accounts nest under the "Bank accounts" group
 * (2080) as 2081-2086 — a parent-prefixed child-code pattern, the
 * conventional way to number a real client sub-ledger under one summary
 * account, matching how `parentAccountId` already models the same
 * relationship structurally.
 *
 * Matched by name, not by a fixed insertion order — safe to re-run any
 * number of times; only ever touches `code`, never any other column.
 * Deliberately NOT in `seed.ts` (that file seeds only what's literally
 * client-confirmed) — same reasoning as `seed-car-makes.ts`.
 */
const CODES: Record<string, string> = {
  // Non-Current Assets
  "Shop at Cost": "1010",
  "Vehicles at Cost": "1020",
  "ERP, Computer & Hardware": "1030",

  // Current Assets
  "Parts Inventory Stock": "2010",
  "Parts Sold but not Invoiced Yet (Un-invoiced delivery challans)": "2020",
  "Security Deposits Account": "2030",
  "Customer Receivable Account": "2040",
  "Cash in Hand": "2050",
  "Easypaisa Account": "2060",
  "Jazz Cash Account": "2070",
  "Bank accounts": "2080",
  "AFL1 Kiyan Traders Others 3390": "2081",
  "AFL2 Kiyan Traders AGPR 8726": "2082",
  "AFL Kiyani Autos 2478": "2083",
  "AFL Kiyani Autos 8727": "2084",
  "FBL Kiyani Autos 5050": "2085",
  "JS Kiyan Traders": "2086",

  // Equity & Reserves
  "Acquisition Cost Account": "3010",
  "Retained Earnings Account": "3020",
  "Provision for Parts inventory stock at LPP": "3030",
  "Income Tax Payable Account": "3040",
  "GST Payable Account": "3050",
  "Drawings Account": "3060",

  // Current Liabilities
  "Supplier Payable Account": "4010",
  "AFL Short Term Loan": "4020",

  // Income/(Loss) Account
  "Sale Income Account (net of sale returns)": "5010",
  "GST Withheld/Payable Account": "5020",
  "Income Tax Withheld/Payable Account": "5030",
  "Other Income Account": "5040",
  "Cost of Good Sold (net of returns)": "5050",
  "Current provision for Parts inventory stock at LPP": "5060",
  "Freight & Transportation Cost Account": "5070",
  "Discount Expense Account (Net)": "5080",
  "Business Expense Account": "5090",
  "Stock Adjustment Account (Net)": "5100",
  "Salaries & Wages Expense Account": "5110",
  "Travelling Expense Account": "5120",
  "Telephone, Electricity & Water Expense Account": "5130",
  "Kitchen Expense Account": "5140",
  "Miscellaneous Expense Account": "5150",
};

async function main() {
  let updated = 0;
  let missing = 0;

  for (const [name, code] of Object.entries(CODES)) {
    const result = await db
      .update(chartOfAccounts)
      .set({ code })
      .where(eq(chartOfAccounts.name, name))
      .returning({ id: chartOfAccounts.id });
    if (result.length === 0) {
      missing++;
      console.warn(`No account named "${name}" found — skipped`);
    } else {
      updated++;
    }
  }

  console.log(`Chart of accounts codes: ${updated} updated, ${missing} not found.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
