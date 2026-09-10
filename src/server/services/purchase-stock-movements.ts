import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { purchaseDocumentLines, stockMovements } from "../../db/schema/index.js";

// Same DbOrTx pattern as document-numbers.ts / stock-movements.ts.
type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Writes "purchase" stock_movements rows for every line on a Goods
 * Receipt — positive (increase) when the receipt is posted (goods have
 * physically arrived), negative (reversal) when a posted receipt is
 * unposted. Simpler than applyStockMovementsForDocument (sales side):
 * purchase lines only ever reference a real control part, never a Deal
 * Part bundle, so there's no component-expansion step.
 *
 * Only ever called for a "goods_receipt" document — a Purchase Order has
 * nothing to move yet, and a Purchase Invoice doesn't move stock a second
 * time (the Goods Receipt it's raised from already did).
 */
export async function applyStockMovementsForPurchaseDocument(
  client: DbOrTx,
  purchaseDocumentId: string,
  direction: 1 | -1,
) {
  const lines = await client
    .select({
      controlPartId: purchaseDocumentLines.controlPartId,
      quantity: purchaseDocumentLines.quantity,
    })
    .from(purchaseDocumentLines)
    .where(eq(purchaseDocumentLines.purchaseDocumentId, purchaseDocumentId));

  if (lines.length === 0) return;

  await client.insert(stockMovements).values(
    lines.map((line) => ({
      controlPartId: line.controlPartId,
      movementType: "purchase" as const,
      quantityDelta: direction * line.quantity,
      purchaseDocumentId,
    })),
  );
}
