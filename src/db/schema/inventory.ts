import {
  boolean,
  integer,
  numeric,
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

/**
 * Gained the Item Form's (Form "A," CLAUDE.md 5.1) lettered fields
 * 2026-09-14 — until now `items` only ever had the bare `name`/
 * `description` this table started with, none of the actual field-by-
 * field spec (Item Code, Part No, Brand, Origin, Class, Engine Info,
 * Model, Size, RPP, SAP, Safety Stock Days, Print Name). `name` itself
 * predates Form A and isn't one of its lettered fields, but stays as the
 * on-screen display label this screen and its tiles already depend on —
 * removing it would ripple through code that has nothing to do with this
 * change.
 *
 * Deliberately NOT built here: Form A's own field (i), "Control Part
 * No. (a lookup into Form B, not free text)." The client's direct answer
 * on 2026-09-10 (CLAUDE.md 5.2) described the simpler chain actually
 * built — items -> control_parts, with `control_parts.itemId` pointing
 * back at the item, the reverse direction from a literal reading of
 * field (i). CLAUDE.md says to treat that already-built, already-
 * confirmed shape as correct going forward, so no new column duplicates
 * or contradicts it here.
 *
 * RPP/SAP are added as plain nullable `numeric(14,2)` fields a user can
 * type into directly — their exact business definition and the
 * "auto-populated"/"adjusted on posting a Stock Adjustment" mechanics
 * (glossary, CLAUDE.md 5.11) are still unconfirmed, so no automatic
 * computation or stock-adjustment wiring is built against them; that
 * would mean guessing at a formula the client has never given. Same
 * reasoning `stock-adjustments.ts`'s own header comment already used to
 * leave SAP out entirely before this pass.
 */
export const items = pgTable("items", {
  ...idColumn,
  markerId: uuid("marker_id").references(() => markers.id),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  // (a) Auto-generated, sequential, all-digits — see
  // services/item-codes.ts — "explicitly noted as a future barcode
  // candidate" (CLAUDE.md 5.1), so no letters/punctuation are mixed in.
  itemCode: varchar("item_code", { length: 20 }).notNull().unique(),
  partNo: varchar("part_no", { length: 100 }), // (b)
  brand: varchar("brand", { length: 100 }), // (c)
  // (d) "Origin (no duplicates)" — the "no duplicates" qualifier isn't
  // enforced here: it's [unclear — confirm] whether that means no two
  // Items may share an Origin value (implausible — many parts share
  // "Original"/"Japan"/etc.) or something narrower the client didn't
  // spell out further. Left as plain free text pending that.
  origin: varchar("origin", { length: 100 }),
  itemClass: varchar("item_class", { length: 100 }), // (e) "Class"
  engineInfo: varchar("engine_info", { length: 200 }), // (f)
  model: varchar("model", { length: 100 }), // (g) — the Item's own free-text field, distinct from `car_models`
  size: varchar("size", { length: 100 }), // (h)
  rpp: numeric("rpp", { precision: 14, scale: 2 }),
  sap: numeric("sap", { precision: 14, scale: 2 }),
  safetyStockDays: integer("safety_stock_days"),
  // System-composed as `Class + Part No + Brand` at creation (CLAUDE.md
  // 5.9's Print Name pattern) but freely editable afterward — whatever's
  // in this field at save time is what prints, same rule as every other
  // Print Name in the app.
  printName: varchar("print_name", { length: 300 }),
  isActive: boolean("is_active").notNull().default(true),
  ...timestampColumns,
  createdBy: uuid("created_by").references(() => users.id),
  updatedBy: uuid("updated_by").references(() => users.id),
});

/**
 * Backs `services/item-codes.ts`'s sequential Item Code generator — one
 * global counter, not per-marker/per-anything, since Item Code is a
 * flat, shop-wide sequence (same reasoning as `document_number_counters`,
 * just without the entity/document-type split that table needs).
 */
export const itemCodeCounters = pgTable("item_code_counters", {
  id: varchar("id", { length: 20 }).primaryKey(),
  lastNumber: integer("last_number").notNull().default(0),
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
