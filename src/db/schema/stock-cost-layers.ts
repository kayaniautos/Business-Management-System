import { integer, numeric, pgTable, uuid } from "drizzle-orm/pg-core";
import { idColumn, timestampColumns } from "./_helpers.js";
import { users } from "./users.js";
import { controlParts } from "./inventory.js";
import { purchaseDocuments } from "./purchase-documents.js";
import { stockMovements } from "./stock-movements.js";

/**
 * LIFO cost-layer engine (CLAUDE.md "LIFO must be deliberate" — section 4's
 * design note, and the "Cost of Goods Sold net of returns (LIFO basis)"
 * chart-of-accounts line, section 4). Built 2026-09-11, once Purchasing
 * finally gave the app a real, recorded unit cost to work from (a Stock
 * Adjustment has no cost concept; only a Goods Receipt/Purchase Invoice
 * does).
 *
 * One `stock_cost_layers` row per "stock actually arrived at a known cost"
 * event — i.e. one per Goods Receipt line, created when that receipt is
 * posted. `quantityRemaining` decrements as later sales consume the layer;
 * `quantityReceived` never changes, so the two together show how much of
 * a given batch is left. Layers are the "last in" side of LIFO: a sale
 * consumes the layer with the highest `id` first (UUIDv7 is time-ordered,
 * so `ORDER BY id DESC` alone is a correct, index-friendly LIFO ordering —
 * no separate timestamp comparison needed).
 *
 * `stock_layer_consumptions` is the audit trail of which layer paid for
 * which sale: one row per (layer, stock_movements row) pair, snapshotting
 * the unit cost actually charged (always equal to the layer's own
 * unitCost today, since a layer's cost never changes after creation, but
 * snapshotted anyway — the same reasoning already used for
 * customerGstNo/customerNtnNo on sales_documents: an already-recorded
 * cost shouldn't drift if something upstream ever changed). Reversing an
 * unposted DN/Invoice restores the layers it drew from and deletes these
 * rows (see src/server/services/lifo-cost-layers.ts) rather than trying
 * to re-run LIFO forward on the reversal.
 *
 * Deliberately NOT built in this pass:
 * - Stock Adjustment (Form F) never creates or consumes a layer. A
 *   positive adjustment (found stock) has no client-specified cost to
 *   record; a negative adjustment (shrinkage) doesn't run through here
 *   either, so a layer's `quantityRemaining` can drift ahead of true
 *   on-hand quantity after a shrinkage adjustment. Not a correctness bug
 *   in what's built — "Stock Adjustment Net" is already its own distinct
 *   chart-of-accounts line from COGS, and nothing built so far needs a
 *   cost figure for a Stock Adjustment. `[unclear — confirm]` if this
 *   is wanted later.
 * - Any actual ledger/journal posting of the resulting COGS figure — the
 *   accounting/ledger module (CLAUDE.md section 8, Phase 4) doesn't exist
 *   yet. COGS here is a computed, queryable figure (surfaced on Sales
 *   History), not a posted account balance.
 * - Selling into a part with no cost layer at all (pre-LIFO stock seeded
 *   before this feature, or selling past what's been costed) is NOT
 *   blocked — the sale still proceeds and decrements the quantity ledger
 *   as before; it simply consumes whatever layers exist and no more,
 *   so COGS is understated for the uncosted portion. Same "don't invent
 *   a business rule for negative stock" precedent already used for the
 *   quantity ledger itself.
 */
export const stockCostLayers = pgTable("stock_cost_layers", {
  ...idColumn,
  controlPartId: uuid("control_part_id")
    .notNull()
    .references(() => controlParts.id),
  // Which Goods Receipt created this layer. Not nullable — every layer
  // traces back to a real, posted receipt; there's no other way to create
  // one in this pass.
  purchaseDocumentId: uuid("purchase_document_id")
    .notNull()
    .references(() => purchaseDocuments.id),
  quantityReceived: integer("quantity_received").notNull(),
  quantityRemaining: integer("quantity_remaining").notNull(),
  unitCost: numeric("unit_cost", { precision: 14, scale: 2 }).notNull(),
  ...timestampColumns,
  createdBy: uuid("created_by").references(() => users.id),
  updatedBy: uuid("updated_by").references(() => users.id),
});

export const stockLayerConsumptions = pgTable("stock_layer_consumptions", {
  ...idColumn,
  costLayerId: uuid("cost_layer_id")
    .notNull()
    .references(() => stockCostLayers.id),
  // The "sale" stock_movements row this consumption paid for — traces back
  // to whichever Invoice/DN line actually took the stock. Not nullable:
  // a layer is only ever consumed by a real sale movement in this pass.
  stockMovementId: uuid("stock_movement_id")
    .notNull()
    .references(() => stockMovements.id),
  quantityConsumed: integer("quantity_consumed").notNull(),
  unitCost: numeric("unit_cost", { precision: 14, scale: 2 }).notNull(),
  ...timestampColumns,
  createdBy: uuid("created_by").references(() => users.id),
  updatedBy: uuid("updated_by").references(() => users.id),
});
