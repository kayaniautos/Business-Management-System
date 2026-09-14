import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { eq, isNotNull, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { controlParts, items, stockMovements } from "../../db/schema/index.js";
import { currentUnitCostsForParts } from "../services/lifo-cost-layers.js";

const suggestionSchema = z.object({
  controlPartId: z.string(),
  partNumber: z.string(),
  partName: z.string(),
  itemName: z.string(),
  safetyStockDays: z.number(),
  quantity: z.number(),
  currentUnitCost: z.string().nullable(),
});

/**
 * Stock Ordering (Form E, CLAUDE.md 5.6) — "reorder suggestions based on
 * Safety Stock Days... on-demand report generation... can feed directly
 * into a purchase order." The client's own notes mark this "Detail
 * Discussed" with no further detail recovered, so this is a first pass
 * built on the plainest reading rather than something to leave blocked
 * indefinitely.
 *
 * `[unclear — confirm]`, explicitly: Safety Stock Days (Form A, section
 * 5.1) is used here as a literal reorder-point QUANTITY — flag when
 * on-hand quantity drops to or below that number — not a true "days of
 * stock cover." A real days-of-cover computation needs a sales-velocity
 * metric (units sold per day, averaged over some window) that doesn't
 * exist anywhere in this codebase; inventing one, and a window length for
 * it, would be a bigger, separately-confirmable feature, not implied by
 * the client's own thin note. Safety Stock Days is being treated as a
 * plain minimum-quantity threshold until told otherwise.
 *
 * Scoped per Control Part, not per Item, even though Safety Stock Days
 * lives on the Item: quantity, LIFO cost, and Goods Receipt/Purchase
 * Order lines are all already tracked per Control Part (CLAUDE.md 5.2's
 * confirmed items -> control_parts direction), so a Control Part's own
 * real stock ledger is compared against its parent Item's threshold. An
 * Item with several Control Parts (e.g. Original/Japan/Thailand variants,
 * CLAUDE.md 5.3) evaluates and can reorder each one independently, since
 * each has its own real stock and its own supplier price at Goods
 * Receipt — combining them into one number would hide which specific
 * variant is actually running low.
 */
export const stockOrderingRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    "/suggestions",
    { schema: { response: { 200: z.array(suggestionSchema) } } },
    async () => {
      const rows = await db
        .select({
          controlPartId: controlParts.id,
          partNumber: controlParts.partNumber,
          partName: controlParts.name,
          itemName: items.name,
          safetyStockDays: items.safetyStockDays,
          quantity: sql<string>`coalesce(sum(${stockMovements.quantityDelta}), 0)`,
        })
        .from(controlParts)
        .innerJoin(items, eq(controlParts.itemId, items.id))
        .leftJoin(stockMovements, eq(stockMovements.controlPartId, controlParts.id))
        .where(isNotNull(items.safetyStockDays))
        .groupBy(controlParts.id, controlParts.partNumber, controlParts.name, items.name, items.safetyStockDays)
        .having(sql`coalesce(sum(${stockMovements.quantityDelta}), 0) <= ${items.safetyStockDays}`)
        .orderBy(sql`coalesce(sum(${stockMovements.quantityDelta}), 0)`);

      const costs = await currentUnitCostsForParts(db, rows.map((r) => r.controlPartId));

      return rows.map((r) => ({
        controlPartId: r.controlPartId,
        partNumber: r.partNumber,
        partName: r.partName,
        itemName: r.itemName,
        safetyStockDays: r.safetyStockDays!,
        quantity: Number(r.quantity),
        currentUnitCost: costs.get(r.controlPartId) ?? null,
      }));
    },
  );
};
