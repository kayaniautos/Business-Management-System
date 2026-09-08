import {
  pgEnum,
  pgTable,
  uniqueIndex,
  uuid,
  varchar,
  boolean,
} from "drizzle-orm/pg-core";
import { idColumn, timestampColumns } from "./_helpers.js";
import { users } from "./users.js";

/**
 * Party Form (Form "D") per CLAUDE.md section 5.5 — customers and vendors.
 * Status and Nature are two independent classification axes; every party
 * needs both.
 *
 * [unclear — confirm] The client's own notes show "O2" for the second
 * Status code, almost certainly a handwriting slip for "C2" (Retail-
 * Counter). Modeled as the 3-option C1/C2/C3 enum per CLAUDE.md's existing
 * reading, but flagging since it hasn't been confirmed with the client.
 *
 * Modeled as enums, not admin-editable tables like roles/permissions,
 * because these are fixed business classifications tied to specific
 * pricing/discount/ledger-posting logic (same reasoning as
 * account_category in accounts.ts) — not something staff create new
 * values for at runtime. Revisit if that assumption turns out wrong.
 */
export const partyStatusEnum = pgEnum("party_status", [
  "C1", // Corporate
  "C2", // Retail-Counter
  "C3", // Wholesale
]);

export const partyNatureEnum = pgEnum("party_nature", [
  "S1", // Vendors/Suppliers A/C
  "S2", // Market Supplier A/C
  "S3", // Customer Receivable A/C
]);

export const parties = pgTable("parties", {
  ...idColumn,
  name: varchar("name", { length: 200 }).notNull(),
  // Defaults to `name` when null — the simplest of the three Print Name
  // patterns in the system (CLAUDE.md 5.9). Resolved at display/print
  // time in the application, not backfilled here.
  printName: varchar("print_name", { length: 200 }),
  gstNo: varchar("gst_no", { length: 50 }),
  ntnNo: varchar("ntn_no", { length: 50 }),
  status: partyStatusEnum("status").notNull(),
  nature: partyNatureEnum("nature").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  ...timestampColumns,
  createdBy: uuid("created_by").references(() => users.id),
  updatedBy: uuid("updated_by").references(() => users.id),
});

/**
 * A party can carry 1 to 5 phone numbers (CLAUDE.md 5.5). The "1 to 5" cap
 * is enforced at the application layer, not here — a DB-level count
 * constraint on a child table needs a trigger, which is overkill for a
 * simple UI-level limit like the discount-line cap elsewhere in this
 * project.
 */
export const partyPhoneNumbers = pgTable(
  "party_phone_numbers",
  {
    ...idColumn,
    partyId: uuid("party_id")
      .notNull()
      .references(() => parties.id, { onDelete: "cascade" }),
    phoneNumber: varchar("phone_number", { length: 30 }).notNull(),
    ...timestampColumns,
    createdBy: uuid("created_by").references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id),
  },
  (table) => [
    uniqueIndex("party_phone_numbers_party_phone_unique").on(
      table.partyId,
      table.phoneNumber,
    ),
  ],
);
