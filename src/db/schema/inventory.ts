import {
  boolean,
  pgTable,
  text,
  uuid,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { idColumn, timestampColumns } from "./_helpers.js";
import { users } from "./users.js";

/**
 * Three-step inventory structure per CLAUDE.md 4.2:
 *   Markers Control Form -> Item Creation Form -> Control Part Number
 * with parent/child linking.
 *
 * [unclear — confirm] CLAUDE.md itself flags that the exact relationship
 * between the Markers/Items form and the Control Part form is not fully
 * specified. This first pass makes the most literal reading (one step feeds
 * the next, 1 marker -> many items -> many control parts) and keeps the
 * links nullable so it doesn't force a shape that turns out to be wrong.
 * Do not treat this as final — confirm with the client before anything
 * (inventory transactions, LIFO cost layers, POS line items) is built on
 * top of control_parts.
 *
 * [unclear — confirm] "Parent/child linking" is modeled here as a
 * self-referential link on control_parts (e.g. a part number with
 * variants/child part numbers). It's equally plausible the client means
 * parent/child at the item level, or across all three levels. Flagging
 * rather than guessing further.
 */

export const markers = pgTable("markers", {
  ...idColumn,
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  ...timestampColumns,
  createdBy: uuid("created_by").references(() => users.id),
  updatedBy: uuid("updated_by").references(() => users.id),
});

export const items = pgTable("items", {
  ...idColumn,
  markerId: uuid("marker_id").references(() => markers.id),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  ...timestampColumns,
  createdBy: uuid("created_by").references(() => users.id),
  updatedBy: uuid("updated_by").references(() => users.id),
});

export const controlParts = pgTable("control_parts", {
  ...idColumn,
  itemId: uuid("item_id").references(() => items.id),
  // Self-referential parent/child link, see [unclear — confirm] note above.
  parentControlPartId: uuid("parent_control_part_id").references(
    (): AnyPgColumn => controlParts.id,
  ),
  partNumber: varchar("part_number", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  ...timestampColumns,
  createdBy: uuid("created_by").references(() => users.id),
  updatedBy: uuid("updated_by").references(() => users.id),
});
