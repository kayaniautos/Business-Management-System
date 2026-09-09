import { integer, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { idColumn, timestampColumns } from "./_helpers.js";
import { users } from "./users.js";
import { controlParts } from "./inventory.js";

/**
 * Stock quantity ledger — did not exist anywhere before this pass. Every
 * other sales feature (checkout, Quotation, DN) has been letting staff
 * "sell" parts without ever touching a quantity-on-hand figure, because
 * none existed. Modeled as an append-only ledger (current quantity =
 * SUM(quantity_delta) for a control part) rather than a single mutable
 * "quantity_on_hand" column, per Mehmoon's direction 2026-09-10: this
 * matches the client's own audit-trail requirement for Stock Adjustment
 * (Form F) and avoids a schema rewrite once LIFO cost layers (CLAUDE.md
 * "LIFO must be deliberate") are built — those will also want a per-
 * movement record, not a single running number.
 *
 * `movementType` only has "adjustment" today because that's the only
 * feature writing to this table so far. Sale/purchase/etc. movement types
 * will be added here once checkout/DN/purchasing actually decrement or
 * increment real stock — that integration is explicitly NOT part of this
 * pass (checkout, Quotation, and DN still do not touch this table).
 */
export const stockMovementTypeEnum = pgEnum("stock_movement_type", [
  "adjustment",
]);

export const stockMovements = pgTable("stock_movements", {
  ...idColumn,
  controlPartId: uuid("control_part_id")
    .notNull()
    .references(() => controlParts.id),
  movementType: stockMovementTypeEnum("movement_type").notNull(),
  // Positive = stock increase, negative = decrease. Never zero — enforced
  // at the application layer, same pattern as the discount/phone-number
  // caps elsewhere in this codebase.
  quantityDelta: integer("quantity_delta").notNull(),
  // Mandatory per the client's own notes ("mandatory, detailed comment" —
  // Form F). NOT NULL here because "adjustment" is the only movement type
  // that exists yet; if a future movement type (e.g. "sale") doesn't need
  // a staff-written comment, this column should become nullable then and
  // the requirement re-enforced at the application layer for adjustments
  // specifically — not decided now, since that type doesn't exist yet.
  reasonComment: text("reason_comment").notNull(),
  ...timestampColumns,
  createdBy: uuid("created_by").references(() => users.id),
  updatedBy: uuid("updated_by").references(() => users.id),
});
