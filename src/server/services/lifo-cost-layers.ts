import { and, desc, eq, gt, inArray, lt } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
  stockCostLayers,
  stockLayerConsumptions,
  stockMovements,
  purchaseDocumentLines,
} from "../../db/schema/index.js";

// Same DbOrTx pattern as the other stock-movement services.
type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Creates or reactivates the cost layers for a Goods Receipt on post
 * (direction 1), or retires them on unpost (direction -1). Called
 * alongside applyStockMovementsForPurchaseDocument, not instead of it —
 * that function still owns the quantity ledger; this owns the cost side.
 *
 * On a first-ever post, one layer is inserted per receipt line. On a
 * post that follows an earlier unpost (a re-post), the existing layer(s)
 * are reactivated (quantityRemaining restored to quantityReceived) rather
 * than inserting duplicates — a Goods Receipt only ever has one layer per
 * line for its whole lifetime, matching how sales_documents itself is
 * append-only for MOVEMENTS but not for this derived, per-line summary.
 */
export async function applyCostLayersForPurchaseDocument(
  client: DbOrTx,
  purchaseDocumentId: string,
  direction: 1 | -1,
) {
  if (direction === -1) {
    // Unposting: this receipt's stock is being taken back. Zero out
    // whatever remains of its layer(s) rather than deleting them, so the
    // audit trail (and any consumption already recorded against them)
    // stays intact. [unclear — confirm] if some of a layer was already
    // sold before the unpost, quantityRemaining simply floors at 0 rather
    // than going negative — the units already sold keep their
    // already-booked COGS, an accepted inconsistency for what should be
    // a rare edge case (unposting a receipt after part of it was resold).
    await client
      .update(stockCostLayers)
      .set({ quantityRemaining: 0 })
      .where(eq(stockCostLayers.purchaseDocumentId, purchaseDocumentId));
    return;
  }

  const existing = await client
    .select({ id: stockCostLayers.id, quantityReceived: stockCostLayers.quantityReceived })
    .from(stockCostLayers)
    .where(eq(stockCostLayers.purchaseDocumentId, purchaseDocumentId));

  if (existing.length > 0) {
    for (const layer of existing) {
      await client
        .update(stockCostLayers)
        .set({ quantityRemaining: layer.quantityReceived })
        .where(eq(stockCostLayers.id, layer.id));
    }
    return;
  }

  const lines = await client
    .select({
      controlPartId: purchaseDocumentLines.controlPartId,
      quantity: purchaseDocumentLines.quantity,
      unitCost: purchaseDocumentLines.unitCost,
    })
    .from(purchaseDocumentLines)
    .where(eq(purchaseDocumentLines.purchaseDocumentId, purchaseDocumentId));

  if (lines.length === 0) return;

  await client.insert(stockCostLayers).values(
    lines.map((l) => ({
      controlPartId: l.controlPartId,
      purchaseDocumentId,
      quantityReceived: l.quantity,
      quantityRemaining: l.quantity,
      unitCost: l.unitCost,
    })),
  );
}

/**
 * Consumes `quantity` units of `controlPartId` from its cost layers in
 * LIFO order (most-recently-created layer with stock left, first),
 * recording one stock_layer_consumptions row per layer touched, all
 * traced back to `stockMovementId` (the "sale" stock_movements row that
 * triggered this). Called once per movement row a sale writes — a Deal
 * Part line already expands into one movement row per component
 * (services/stock-movements.ts), so this never needs its own bundle
 * handling.
 *
 * If available layers run out before `quantity` is fully consumed (stock
 * that predates this feature, or selling past what's costed), the
 * shortfall is simply left unconsumed — no error, no layer invented.
 * COGS for that sale is understated by exactly the uncosted portion.
 */
export async function consumeLifoForSaleMovement(
  client: DbOrTx,
  stockMovementId: string,
  controlPartId: string,
  quantity: number,
) {
  let remaining = quantity;

  const layers = await client
    .select({ id: stockCostLayers.id, quantityRemaining: stockCostLayers.quantityRemaining, unitCost: stockCostLayers.unitCost })
    .from(stockCostLayers)
    .where(and(eq(stockCostLayers.controlPartId, controlPartId), gt(stockCostLayers.quantityRemaining, 0)))
    .orderBy(desc(stockCostLayers.id));

  for (const layer of layers) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, layer.quantityRemaining);

    await client
      .update(stockCostLayers)
      .set({ quantityRemaining: layer.quantityRemaining - take })
      .where(eq(stockCostLayers.id, layer.id));

    await client.insert(stockLayerConsumptions).values({
      costLayerId: layer.id,
      stockMovementId,
      quantityConsumed: take,
      unitCost: layer.unitCost,
    });

    remaining -= take;
  }
}

/**
 * Reverses the LIFO consumption tied to a sales document's ORIGINAL
 * decrement movements (the negative "sale" rows written when it was
 * posted) — restoring each consumed layer's quantityRemaining and
 * deleting the consumption rows, rather than re-running LIFO forward on
 * the reversal. Called when a document is unposted (stock-movements.ts's
 * applyStockMovementsForDocument, direction +1), right after it writes
 * the new positive reversal movement rows — those reversal rows don't
 * consume anything themselves, they just trigger this cleanup of what the
 * original decrement already consumed.
 *
 * Safe to call on a document that's been through multiple post/unpost
 * cycles: once a consumption row is deleted here, a later call simply
 * won't find it again, so nothing double-reverses.
 */
export async function reverseLifoForSalesDocument(client: DbOrTx, salesDocumentId: string) {
  const decrementMovements = await client
    .select({ id: stockMovements.id })
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.salesDocumentId, salesDocumentId),
        eq(stockMovements.movementType, "sale"),
        lt(stockMovements.quantityDelta, 0),
      ),
    );

  if (decrementMovements.length === 0) return;
  const movementIds = decrementMovements.map((m) => m.id);

  const consumptions = await client
    .select({
      id: stockLayerConsumptions.id,
      costLayerId: stockLayerConsumptions.costLayerId,
      quantityConsumed: stockLayerConsumptions.quantityConsumed,
    })
    .from(stockLayerConsumptions)
    .where(inArray(stockLayerConsumptions.stockMovementId, movementIds));

  for (const consumption of consumptions) {
    const [layer] = await client
      .select({ quantityRemaining: stockCostLayers.quantityRemaining })
      .from(stockCostLayers)
      .where(eq(stockCostLayers.id, consumption.costLayerId));

    if (layer) {
      await client
        .update(stockCostLayers)
        .set({ quantityRemaining: layer.quantityRemaining + consumption.quantityConsumed })
        .where(eq(stockCostLayers.id, consumption.costLayerId));
    }

    await client.delete(stockLayerConsumptions).where(eq(stockLayerConsumptions.id, consumption.id));
  }
}
