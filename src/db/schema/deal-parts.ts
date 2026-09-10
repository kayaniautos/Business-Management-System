import { boolean, integer, pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";
import { idColumn, timestampColumns } from "./_helpers.js";
import { users } from "./users.js";
import { controlParts } from "./inventory.js";

/**
 * Deal Part (Form C, CLAUDE.md 5.4) — a sales-time bundle of 2+ Items sold
 * and printed under one manually-typed name. Unlike Form A's Print Name
 * (auto-composed from Class + Part No + Brand, editable), a Deal Part's
 * name is typed from scratch — there's no catalog data to compose it from.
 *
 * The bundle itself never holds stock (CLAUDE.md 5.4: "the bundle itself
 * never holds stock — a Deal Part sale posts stock movement against the
 * underlying Items"). `dealPartComponents` only records the recipe
 * (which parts, how many of each per bundle), not a price — pricing is
 * decided at time of sale (CLAUDE.md 5.4: "not cached on the Deal Part
 * definition"), same gross-price-entry pattern as an individual part.
 *
 * The "posts stock movement against underlying Items" line is NOT built
 * in this pass — no sales feature (checkout/Quotation/DN) touches the
 * stock_movements ledger yet (see that schema file's own header comment);
 * this is a pre-existing, already-flagged gap, not something introduced
 * by Deal Part specifically.
 */
export const dealParts = pgTable("deal_parts", {
  ...idColumn,
  printName: varchar("print_name", { length: 200 }).notNull(),
  description: text("description"),
  // Same soft-deactivate pattern as markers/items/control_parts
  // (src/db/schema/inventory.ts) rather than a hard delete.
  isActive: boolean("is_active").notNull().default(true),
  ...timestampColumns,
  createdBy: uuid("created_by").references(() => users.id),
  updatedBy: uuid("updated_by").references(() => users.id),
});

export const dealPartComponents = pgTable("deal_part_components", {
  ...idColumn,
  dealPartId: uuid("deal_part_id")
    .notNull()
    .references(() => dealParts.id, { onDelete: "cascade" }),
  controlPartId: uuid("control_part_id")
    .notNull()
    .references(() => controlParts.id),
  quantity: integer("quantity").notNull().default(1),
  ...timestampColumns,
  createdBy: uuid("created_by").references(() => users.id),
  updatedBy: uuid("updated_by").references(() => users.id),
});
