import { integer, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { idColumn, timestampColumns } from "./_helpers.js";
import { users } from "./users.js";
import { controlParts } from "./inventory.js";
import { salesDocuments } from "./sales-documents.js";
import { purchaseDocuments } from "./purchase-documents.js";

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
 * `movementType` added "sale" 2026-09-10 (Mehmoon's direction: wire real
 * stock movements into sales) — written by checkout (Invoice, decremented
 * immediately at creation, matching "posted at point of sale") and by DN
 * post/unpost (decremented on post, reversed with a positive-delta "sale"
 * row on unpost — see src/server/services/stock-movements.ts). Quotation
 * never writes here, matching its "zero accounting impact" spec
 * (CLAUDE.md 5.10). A Deal Part line (CLAUDE.md 5.4) expands into one row
 * per underlying component part, quantity = line qty * component qty —
 * "a Deal Part sale posts stock movement against the underlying Items."
 * `movementType` gained "purchase" 2026-09-11 (Mehmoon's direction:
 * purchasing/goods receipt) — written by Goods Receipt post/unpost only
 * (src/server/services/purchase-stock-movements.ts). A Purchase Order has
 * no stock effect (nothing has arrived yet); a Purchase Invoice has none
 * either, since the Goods Receipt it's raised from already moved stock —
 * see purchase-documents.ts's header comment for the full reasoning.
 *
 * `[unclear — confirm]` Selling into negative stock is NOT blocked —
 * nothing in the client's notes confirms whether backorder/negative
 * stock should be allowed or hard-blocked, so this doesn't invent a
 * business rule either way; the ledger just records whatever happens.
 *
 * `movementType` gained "supplier_return" 2026-09-12 — written by a
 * Supplier Return document's post/unpost (src/server/services/
 * supplier-return-stock.ts), always a decrease on post (goods physically
 * leaving back to the supplier) and a reversal on unpost. Traced via the
 * same `purchaseDocumentId` column, pointing at the return document
 * itself (not the original Goods Receipt it's returning against — that
 * link lives in `purchase_document_links` instead).
 */
export const stockMovementTypeEnum = pgEnum("stock_movement_type", [
  "adjustment",
  "sale",
  "purchase",
  "supplier_return",
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
  // Mandatory only for "adjustment" (Form F's own confirmed requirement),
  // enforced at the application layer, not here — a "sale" movement has
  // no staff-written comment, it's traced back to its document instead.
  reasonComment: text("reason_comment"),
  // Traces a "sale" movement back to the Invoice/DN that caused it — null
  // for every other movement type.
  salesDocumentId: uuid("sales_document_id").references(() => salesDocuments.id),
  // Traces a "purchase" movement back to the Goods Receipt, or a
  // "supplier_return" movement back to the Return document — null for
  // every other movement type. Separate nullable column rather than
  // reusing salesDocumentId, since the two reference different tables.
  purchaseDocumentId: uuid("purchase_document_id").references(() => purchaseDocuments.id),
  ...timestampColumns,
  createdBy: uuid("created_by").references(() => users.id),
  updatedBy: uuid("updated_by").references(() => users.id),
});
