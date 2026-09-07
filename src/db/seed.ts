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
    { category: "non_current_asset", name: "Software/Computer/Hardware" },
    // Current Assets
    { category: "current_asset", name: "Parts Inventory Stock" },
    { category: "current_asset", name: "Parts Sold but not Invoiced Yet" },
    { category: "current_asset", name: "Security Deposits" },
    { category: "current_asset", name: "Income Tax Withheld" },
    { category: "current_asset", name: "GST Withheld" },
    { category: "current_asset", name: "Customer Receivable" },
    { category: "current_asset", name: "Cash in Hand" },
    { category: "current_asset", name: "Easypaisa" },
    { category: "current_asset", name: "Jazz Cash" },
    // Equity & Reserves
    { category: "equity_reserve", name: "Acquisition Cost" },
    { category: "equity_reserve", name: "Retained Earnings" },
    { category: "equity_reserve", name: "Drawings" },
    // Current Liabilities
    { category: "current_liability", name: "Supplier Payable" },
    { category: "current_liability", name: "AFL Short Term Loan" },
    // Income/(Loss)
    { category: "income_loss", name: "Sale Income net of returns" },
    { category: "income_loss", name: "Other Income" },
    { category: "income_loss", name: "Cost of Goods Sold net of returns" },
    { category: "income_loss", name: "Freight & Transportation Cost" },
    { category: "income_loss", name: "Discount Expense Net" },
    { category: "income_loss", name: "Business Expense" },
    { category: "income_loss", name: "Stock Adjustment Net" },
    { category: "income_loss", name: "Salaries & Wages" },
    { category: "income_loss", name: "Telephone/Electricity/Water Expense" },
    { category: "income_loss", name: "Kitchen Expense" },
    { category: "income_loss", name: "Miscellaneous Expense" },
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
