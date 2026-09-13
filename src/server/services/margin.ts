import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { marginSettings, salesDocumentLines } from "../../db/schema/index.js";
import { currentUnitCostsForParts } from "./lifo-cost-layers.js";

// Same DbOrTx pattern as the other stock-movement services.
type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Margin alert (CLAUDE.md 5.10): "soft warning (not a hard block) when a
 * line's margin falls outside a configured band." No admin has ever
 * edited the singleton `margin_settings` row before the app's first
 * sale, so this plain default (matching the schema column's own default)
 * covers that gap without a seed script or migration data-fill.
 */
const DEFAULT_MINIMUM_MARGIN_PERCENT = 15;

export async function getMinimumMarginPercent(client: DbOrTx = db): Promise<number> {
  const [row] = await client.select({ value: marginSettings.minimumMarginPercent }).from(marginSettings).limit(1);
  return row ? Number(row.value) : DEFAULT_MINIMUM_MARGIN_PERCENT;
}

/**
 * Upserts the one `margin_settings` row — there's never more than one,
 * enforced here rather than at the database level (see that table's own
 * comment for why).
 */
export async function setMinimumMarginPercent(percent: number, updatedBy?: string): Promise<void> {
  const [existing] = await db.select({ id: marginSettings.id }).from(marginSettings).limit(1);
  if (existing) {
    await db
      .update(marginSettings)
      .set({ minimumMarginPercent: percent.toFixed(2), updatedAt: new Date(), updatedBy })
      .where(eq(marginSettings.id, existing.id));
  } else {
    await db.insert(marginSettings).values({ minimumMarginPercent: percent.toFixed(2), updatedBy });
  }
}

/**
 * Evaluates and writes `unitCostAtSale`/`belowMarginBand` for every
 * control-part line on a sales document, using the front-of-LIFO-queue
 * cost at the moment this is called — see sales-documents.ts's own
 * column comment for why that's a deliberate approximation, not the
 * line's real, eventually-consumed cost.
 *
 * Called at the exact moment a document's stock actually moves (checkout,
 * immediately; a Delivery Note, on POST; an Invoice-from-DN, at creation
 * since it's already posted) — never for a Quotation, which never posts
 * and has "zero accounting impact" (CLAUDE.md 5.10), so there's no real
 * sale yet to evaluate a margin against.
 *
 * Reads lines back from the database rather than taking them as a
 * parameter, matching applyStockMovementsForDocument's own reasoning —
 * works whether the caller just inserted them in this transaction
 * (checkout, Invoice-from-DN) or they were created earlier (DN post).
 * Deal Part lines (controlPartId null) are skipped entirely — margin
 * evaluation for a bundle would need summing several components' costs,
 * not built here (CLAUDE.md 5.4's own "deliberately not built" list).
 */
export async function evaluateAndFlagMarginForDocument(client: DbOrTx, salesDocumentId: string) {
  const lines = await client
    .select({
      id: salesDocumentLines.id,
      controlPartId: salesDocumentLines.controlPartId,
      unitGrossPrice: salesDocumentLines.unitGrossPrice,
    })
    .from(salesDocumentLines)
    .where(eq(salesDocumentLines.salesDocumentId, salesDocumentId));

  const partIds = [...new Set(lines.filter((l) => l.controlPartId).map((l) => l.controlPartId!))];
  if (partIds.length === 0) return;

  const [costs, thresholdPercent] = await Promise.all([
    currentUnitCostsForParts(client, partIds),
    getMinimumMarginPercent(client),
  ]);

  for (const line of lines) {
    if (!line.controlPartId) continue;
    const cost = costs.get(line.controlPartId) ?? null;
    const price = Number(line.unitGrossPrice);
    const belowMarginBand =
      cost != null && price > 0 ? ((price - Number(cost)) / price) * 100 < thresholdPercent : false;

    await client
      .update(salesDocumentLines)
      .set({ unitCostAtSale: cost, belowMarginBand })
      .where(eq(salesDocumentLines.id, line.id));
  }
}
