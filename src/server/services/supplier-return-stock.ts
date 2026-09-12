import { and, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
  purchaseDocumentLines,
  purchaseDocumentLinks,
  stockMovements,
  stockCostLayers,
} from "../../db/schema/index.js";

// Same DbOrTx pattern as the other stock-movement services.
type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Writes "supplier_return" stock_movements rows for every line on a
 * Supplier Return — negative (decrease) when the return is posted (goods
 * are physically leaving, back to the supplier), positive (reversal)
 * when a posted return is unposted. Same shape as
 * applyStockMovementsForPurchaseDocument, just the opposite direction:
 * a Goods Receipt posting is stock arriving (+), a Supplier Return
 * posting is stock leaving (-).
 */
export async function applyStockMovementsForSupplierReturn(
  client: DbOrTx,
  returnDocumentId: string,
  direction: 1 | -1,
) {
  const lines = await client
    .select({
      controlPartId: purchaseDocumentLines.controlPartId,
      quantity: purchaseDocumentLines.quantity,
    })
    .from(purchaseDocumentLines)
    .where(eq(purchaseDocumentLines.purchaseDocumentId, returnDocumentId));

  if (lines.length === 0) return;

  await client.insert(stockMovements).values(
    lines.map((line) => ({
      controlPartId: line.controlPartId,
      movementType: "supplier_return" as const,
      quantityDelta: -direction * line.quantity,
      purchaseDocumentId: returnDocumentId,
    })),
  );
}

/**
 * Reduces the SPECIFIC cost layer the original Goods Receipt created —
 * found via the `purchase_document_links` row required at creation
 * (handover doc 6.3: "linked back to the original purchase voucher") —
 * by the returned quantity on post, restoring it on unpost. Unlike the
 * sales side's LIFO consumption, this never runs a fresh LIFO pass: a
 * return is physically the same batch that arrived on that receipt, so
 * it must come back out of that exact layer, not whichever layer happens
 * to be "last in" at return time.
 *
 * Bounded at [0, quantityReceived] the same way Goods Receipt unpost is
 * — if some of that batch was already sold before the return (so
 * quantityRemaining is less than the return quantity), this floors at 0
 * rather than going negative. `[unclear — confirm]` whether returning
 * more than what's still on hand from that batch should be blocked
 * outright; not invented here, same "don't guess a business rule"
 * precedent as everywhere else this situation comes up.
 */
export async function applyCostLayersForSupplierReturn(
  client: DbOrTx,
  returnDocumentId: string,
  direction: 1 | -1,
) {
  const [link] = await client
    .select({ sourceGoodsReceiptId: purchaseDocumentLinks.fromDocumentId })
    .from(purchaseDocumentLinks)
    .where(eq(purchaseDocumentLinks.toDocumentId, returnDocumentId));

  if (!link) return;

  const lines = await client
    .select({
      controlPartId: purchaseDocumentLines.controlPartId,
      quantity: purchaseDocumentLines.quantity,
    })
    .from(purchaseDocumentLines)
    .where(eq(purchaseDocumentLines.purchaseDocumentId, returnDocumentId));

  for (const line of lines) {
    const [layer] = await client
      .select({ id: stockCostLayers.id, quantityRemaining: stockCostLayers.quantityRemaining, quantityReceived: stockCostLayers.quantityReceived })
      .from(stockCostLayers)
      .where(
        and(
          eq(stockCostLayers.purchaseDocumentId, link.sourceGoodsReceiptId),
          eq(stockCostLayers.controlPartId, line.controlPartId),
        ),
      );

    if (!layer) continue;

    const next = Math.min(
      layer.quantityReceived,
      Math.max(0, layer.quantityRemaining - direction * line.quantity),
    );

    await client.update(stockCostLayers).set({ quantityRemaining: next }).where(eq(stockCostLayers.id, layer.id));
  }
}
