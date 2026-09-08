import {
  boolean,
  pgEnum,
  pgTable,
  text,
  uuid,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { idColumn, timestampColumns } from "./_helpers.js";
import { users } from "./users.js";
import { legalEntities } from "./entities.js";

/**
 * The five top-level headers from the client's chart of accounts
 * (CLAUDE.md 4.4). Modeled as an enum, not an admin-editable table like
 * roles/permissions, because these are fixed accounting classifications
 * (asset/liability/equity/income), not business-configurable roles.
 */
export const accountCategoryEnum = pgEnum("account_category", [
  "non_current_asset",
  "current_asset",
  "equity_reserve",
  "current_liability",
  "income_loss",
]);

/**
 * Flat chart of accounts (CLAUDE.md 4.4): despite two legal entities, this
 * is a single flat list. Entity differentiation exists ONLY at the bank
 * account level — legalEntityId is null for every row except the 5 bank
 * accounts. Do not add entity_id anywhere else off the back of this table.
 *
 * parentAccountId lets the 5 bank accounts sit under one "Bank accounts"
 * grouping row while everything else stays flat (matches the client's list,
 * which nests bank accounts one level under Current Assets).
 *
 * [unclear — confirm] "Chart of accounts coding should be expansion-ready"
 * per CLAUDE.md design notes, but no actual numbering scheme was provided.
 * `code` is left nullable/free-text until that scheme is confirmed.
 *
 * [unclear — confirm] CLAUDE.md design notes also say "Report classification
 * should be based on a Party Form" — no Party Form details exist yet
 * (customers/suppliers subledger). Not built here; flagging so
 * Customer Receivable / Supplier Payable aren't assumed to be simple
 * single-balance accounts once that conversation happens.
 */
export const chartOfAccounts = pgTable("chart_of_accounts", {
  ...idColumn,
  category: accountCategoryEnum("category").notNull(),
  name: varchar("name", { length: 200 }).notNull().unique(),
  code: varchar("code", { length: 50 }),
  // Verbatim annotations from the client's own spreadsheet on specific
  // accounts, e.g. "status of party-wise" or "status of party-wise on the
  // basis of LIFO" (CLAUDE.md section 4). Free text, not structured,
  // because the Party Form (CLAUDE.md 5.5) this ties to doesn't exist yet.
  note: text("note"),
  parentAccountId: uuid("parent_account_id").references(
    (): AnyPgColumn => chartOfAccounts.id,
  ),
  // Populated only for the 6 bank accounts. Null everywhere else.
  legalEntityId: uuid("legal_entity_id").references(() => legalEntities.id),
  isActive: boolean("is_active").notNull().default(true),
  ...timestampColumns,
  createdBy: uuid("created_by").references(() => users.id),
  updatedBy: uuid("updated_by").references(() => users.id),
});
