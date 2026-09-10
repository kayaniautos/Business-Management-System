import { eq, inArray } from "drizzle-orm";
import { db } from "../../db/client.js";
import { salesDocumentLines, dealPartComponents, stockMovements } from "../../db/schema/index.js";

// Same DbOrTx pattern as document-numbers.ts — accepts either the
// top-level db handle or a transaction handle from db.transaction().
type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Writes "sale" stock_movements rows for every line on a sales document —
 * negative (decrement) when a document is sold/posted, positive
 * (restore) when a posted document is unposted. A Deal Part line
 * (CLAUDE.md 5.4) expands into one row per underlying component part
 * ("a Deal Part sale posts stock movement against the underlying
 * Items"); a regular line writes one row directly.
 *
 * Reads the lines back from the database rather than taking them as a
 * parameter, so the same function works whether the caller just inserted
 * them in this transaction (checkout) or they were created earlier in a
 * prior request (DN post/unpost).
 */
export async function applyStockMovementsForDocument(
  client: DbOrTx,
  salesDocumentId: string,
  direction: 1 | -1,
) {
  const lines = await client
    .select({
      controlPartId: salesDocumentLines.controlPartId,
      dealPartId: salesDocumentLines.dealPartId,
      quantity: salesDocumentLines.quantity,
    })
    .from(salesDocumentLines)
    .where(eq(salesDocumentLines.salesDocumentId, salesDocumentId));

  if (lines.length === 0) return;

  const dealPartIds = [...new Set(lines.filter((l) => l.dealPartId).map((l) => l.dealPartId!))];
  const componentsByDealPart = new Map<string, { controlPartId: string; quantity: number }[]>();
  if (dealPartIds.length > 0) {
    const componentRows = await client
      .select({
        dealPartId: dealPartComponents.dealPartId,
        controlPartId: dealPartComponents.controlPartId,
        quantity: dealPartComponents.quantity,
      })
      .from(dealPartComponents)
      .where(inArray(dealPartComponents.dealPartId, dealPartIds));
    for (const row of componentRows) {
      const list = componentsByDealPart.get(row.dealPartId) ?? [];
      list.push({ controlPartId: row.controlPartId, quantity: row.quantity });
      componentsByDealPart.set(row.dealPartId, list);
    }
  }

  const movementRows: { controlPartId: string; quantityDelta: number }[] = [];
  for (const line of lines) {
    if (line.controlPartId) {
      movementRows.push({ controlPartId: line.controlPartId, quantityDelta: direction * line.quantity });
    } else if (line.dealPartId) {
      const components = componentsByDealPart.get(line.dealPartId) ?? [];
      for (const component of components) {
        movementRows.push({
          controlPartId: component.controlPartId,
          quantityDelta: direction * line.quantity * component.quantity,
        });
      }
    }
  }

  if (movementRows.length === 0) return;

  await client.insert(stockMovements).values(
    movementRows.map((m) => ({
      controlPartId: m.controlPartId,
      movementType: "sale" as const,
      quantityDelta: m.quantityDelta,
      salesDocumentId,
    })),
  );
}
