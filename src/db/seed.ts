import { db } from "./client.js";
import { legalEntities } from "./schema/entities.js";
import { chartOfAccounts } from "./schema/accounts.js";
import { roles } from "./schema/users.js";

/**
 * Seeds only what's literally confirmed in CLAUDE.md: the two legal
 * entities, the flat chart of accounts, and the five role names. Does NOT
 * seed permissions or role_permissions grants — those keys aren't defined
 * yet and shouldn't be invented here.
 *
 * The chart of accounts below matches `chart of accounts.xlsx`
 * (client-provided 2026-09-07) verbatim, verified cell-by-cell against the
 * actual file on 2026-09-08 (see DECISIONS.md) — including its exact
 * wording (e.g. "Cost of Good Sold", singular, as the client's own file
 * has it) and the two accounts moved from Current Assets to Income/(Loss)
 * per that file. Do not "fix" wording to look more correct without
 * checking the source file again first.
 *
 * Safe to re-run: every insert is onConflictDoNothing keyed on the same
 * unique constraint the schema defines.
 */
async function main() {
  const [kiyanTraders, kiyaniAutos] = await db
    .insert(legalEntities)
    .values([
      { name: "Kiyan Traders", isGstRegistered: true, isFbrIntegrated: true },
      { name: "Kiyani Autos", isGstRegistered: false, isFbrIntegrated: false },
    ])
    .onConflictDoNothing({ target: legalEntities.name })
    .returning();

  const nonBankAccounts = [
    // Non-Current Assets
    { category: "non_current_asset", name: "Shop at Cost" },
    { category: "non_current_asset", name: "Vehicles at Cost" },
    { category: "non_current_asset", name: "ERP, Computer & Hardware" },
    // Current Assets
    { category: "current_asset", name: "Parts Inventory Stock" },
    {
      category: "current_asset",
      name: "Parts Sold but not Invoiced Yet (Un-invoiced delivery challans)",
    },
    { category: "current_asset", name: "Security Deposits Account" },
    { category: "current_asset", name: "Customer Receivable Account" },
    { category: "current_asset", name: "Cash in Hand" },
    { category: "current_asset", name: "Easypaisa Account" },
    { category: "current_asset", name: "Jazz Cash Account" },
    // Equity & Reserves
    { category: "equity_reserve", name: "Acquisition Cost Account" },
    { category: "equity_reserve", name: "Retained Earnings Account" },
    {
      category: "equity_reserve",
      name: "Provision for Parts inventory stock at LPP",
    },
    { category: "equity_reserve", name: "Income Tax Payable Account" },
    { category: "equity_reserve", name: "GST Payable Account" },
    { category: "equity_reserve", name: "Drawings Account" },
    // Current Liabilities
    { category: "current_liability", name: "Supplier Payable Account" },
    { category: "current_liability", name: "AFL Short Term Loan" },
    // Income/(Loss) Account
    {
      category: "income_loss",
      name: "Sale Income Account (net of sale returns)",
      note: "status of party-wise",
    },
    {
      category: "income_loss",
      name: "GST Withheld/Payable Account",
      note: "status of party-wise",
    },
    {
      category: "income_loss",
      name: "Income Tax Withheld/Payable Account",
      note: "status of party-wise",
    },
    { category: "income_loss", name: "Other Income Account" },
    {
      category: "income_loss",
      name: "Cost of Good Sold (net of returns)",
      note: "status of party-wise on the basis of LIFO",
    },
    {
      category: "income_loss",
      name: "Current provision for Parts inventory stock at LPP",
    },
    { category: "income_loss", name: "Freight & Transportation Cost Account" },
    { category: "income_loss", name: "Discount Expense Account (Net)" },
    { category: "income_loss", name: "Business Expense Account" },
    { category: "income_loss", name: "Stock Adjustment Account (Net)" },
    { category: "income_loss", name: "Salaries & Wages Expense Account" },
    { category: "income_loss", name: "Travelling Expense Account" },
    {
      category: "income_loss",
      name: "Telephone, Electricity & Water Expense Account",
    },
    { category: "income_loss", name: "Kitchen Expense Account" },
    { category: "income_loss", name: "Miscellaneous Expense Account" },
  ] satisfies (typeof chartOfAccounts.$inferInsert)[];

  await db
    .insert(chartOfAccounts)
    .values(nonBankAccounts)
    .onConflictDoNothing({ target: chartOfAccounts.name });

  const [bankAccountsGroup] = await db
    .insert(chartOfAccounts)
    .values({ category: "current_asset", name: "Bank accounts" })
    .onConflictDoNothing({ target: chartOfAccounts.name })
    .returning();

  const bankGroupId =
    bankAccountsGroup?.id ??
    (
      await db.query.chartOfAccounts.findFirst({
        where: (a, { eq }) => eq(a.name, "Bank accounts"),
      })
    )?.id;

  const kiyanTradersId =
    kiyanTraders?.id ??
    (
      await db.query.legalEntities.findFirst({
        where: (e, { eq }) => eq(e.name, "Kiyan Traders"),
      })
    )?.id;

  const kiyaniAutosId =
    kiyaniAutos?.id ??
    (
      await db.query.legalEntities.findFirst({
        where: (e, { eq }) => eq(e.name, "Kiyani Autos"),
      })
    )?.id;

  await db
    .insert(chartOfAccounts)
    .values([
      {
        category: "current_asset",
        name: "AFL1 Kiyan Traders Others 3390",
        parentAccountId: bankGroupId,
        legalEntityId: kiyanTradersId,
      },
      {
        category: "current_asset",
        name: "AFL2 Kiyan Traders AGPR 8726",
        parentAccountId: bankGroupId,
        legalEntityId: kiyanTradersId,
      },
      {
        category: "current_asset",
        name: "AFL Kiyani Autos 2478",
        parentAccountId: bankGroupId,
        legalEntityId: kiyaniAutosId,
      },
      {
        category: "current_asset",
        name: "AFL Kiyani Autos 8727",
        parentAccountId: bankGroupId,
        legalEntityId: kiyaniAutosId,
      },
      {
        category: "current_asset",
        name: "FBL Kiyani Autos 5050",
        parentAccountId: bankGroupId,
        legalEntityId: kiyaniAutosId,
      },
      {
        category: "current_asset",
        name: "JS Kiyan Traders",
        parentAccountId: bankGroupId,
        legalEntityId: kiyanTradersId,
      },
    ])
    .onConflictDoNothing({ target: chartOfAccounts.name });

  await db
    .insert(roles)
    .values([
      { name: "Counter Control", isSystem: true },
      { name: "Corporate Control", isSystem: true },
      { name: "Receipts/Payments Control", isSystem: true },
      { name: "Inventory Control", isSystem: true },
      { name: "Management Control", isSystem: true },
    ])
    .onConflictDoNothing({ target: roles.name });

  console.log("Seed complete.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
