import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { controlParts, stockMovements } from "../../db/schema/index.js";

const errorResponseSchema = z.object({ error: z.string() });

const quantityResponseSchema = z.object({
  controlPartId: z.string(),
  quantity: z.number(),
});

const adjustmentResponseSchema = z.object({
  id: z.string(),
  controlPartId: z.string(),
  partNumber: z.string(),
  partName: z.string(),
  quantityDelta: z.number(),
  reasonComment: z.string(),
  createdAt: z.string(),
});

const adjustmentWithBalanceSchema = adjustmentResponseSchema.extend({
  quantityAfter: z.number(),
});

async function currentQuantity(controlPartId: string): Promise<number> {
  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(${stockMovements.quantityDelta}), 0)`,
    })
    .from(stockMovements)
    .where(eq(stockMovements.controlPartId, controlPartId));
  return Number(row?.total ?? 0);
}

/**
 * Stock Adjustment (Form F, CLAUDE.md 5.7) — the first feature to actually
 * write to the stock_movements ledger (see that schema file's header
 * comment: no other route yet decrements/increments real stock).
 *
 * The client's own notes describe a single-step flow — pick item, see
 * current qty, enter +/- delta with a mandatory comment — with no
 * separate draft/post stage of its own, unlike Quotation/DN/Invoice.
 * Modeled that way here: POST writes the ledger row immediately, there is
 * no draft state to create first. `[unclear — confirm]` if the client
 * actually wants an approval/draft gate before an adjustment takes real
 * effect, matching the Quotation/DN/Invoice Post/Unpost pattern (CLAUDE.md
 * 5.9) — nothing in the client's own notes asks for that specifically for
 * this form, so it wasn't invented here.
 *
 * Deliberately NOT built in this pass: "on posting, SAP is adjusted as a
 * consequence" (client's note, CLAUDE.md 5.7). SAP doesn't exist as a
 * schema field anywhere yet (Form A / RPP / SAP were never built - see
 * CLAUDE.md 5.1/5.2), and its exact business definition is still flagged
 * as unconfirmed (CLAUDE.md 5.11 glossary). Adding a guessed-at SAP column
 * just to make this line true would be building on an unconfirmed concept.
 *
 * The history list below deliberately does NOT show a per-row running
 * "quantity after" balance — it's capped at the most recent 100 rows
 * across all parts, so a balance computed only from that window would be
 * wrong for any part with older movements outside it. "Current quantity"
 * is only ever reported freshly computed from the full ledger (the
 * quantity endpoint, and the POST response after writing a new row).
 */
export const stockAdjustmentsRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    "/quantity/:controlPartId",
    {
      schema: {
        params: z.object({ controlPartId: z.string().uuid() }),
        response: { 200: quantityResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const { controlPartId } = request.params;
      const part = await db.query.controlParts.findFirst({
        where: eq(controlParts.id, controlPartId),
      });
      if (!part) return reply.code(404).send({ error: "Part not found" });

      return { controlPartId, quantity: await currentQuantity(controlPartId) };
    },
  );

  app.get(
    "/",
    {
      schema: {
        querystring: z.object({ q: z.string().optional() }),
        response: { 200: z.array(adjustmentResponseSchema) },
      },
    },
    async (request) => {
      const { q } = request.query;
      const pattern = q ? `%${q}%` : undefined;

      const rows = await db
        .select({
          id: stockMovements.id,
          controlPartId: stockMovements.controlPartId,
          partNumber: controlParts.partNumber,
          partName: controlParts.name,
          quantityDelta: stockMovements.quantityDelta,
          reasonComment: stockMovements.reasonComment,
          createdAt: stockMovements.createdAt,
        })
        .from(stockMovements)
        .innerJoin(controlParts, eq(stockMovements.controlPartId, controlParts.id))
        .where(
          pattern
            ? sql`${controlParts.partNumber} ilike ${pattern} or ${controlParts.name} ilike ${pattern}`
            : undefined,
        )
        .orderBy(desc(stockMovements.createdAt))
        .limit(100);

      return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
    },
  );

  app.post(
    "/",
    {
      schema: {
        body: z.object({
          controlPartId: z.string().uuid(),
          quantityDelta: z
            .number()
            .int()
            .refine((n) => n !== 0, "Adjustment quantity cannot be zero"),
          // "Mandatory, detailed comment" (CLAUDE.md 5.7) — enforced here
          // as non-empty text. "Detailed" isn't given a specific length or
          // format by the client, so no arbitrary character minimum is
          // invented; this is left to staff discretion/training.
          reasonComment: z.string().trim().min(1, "A reason comment is required"),
        }),
        response: { 200: adjustmentWithBalanceSchema, 400: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const { controlPartId, quantityDelta, reasonComment } = request.body;

      const part = await db.query.controlParts.findFirst({
        where: eq(controlParts.id, controlPartId),
      });
      if (!part) return reply.code(400).send({ error: "Part not found" });

      const [movement] = await db
        .insert(stockMovements)
        .values({ controlPartId, movementType: "adjustment", quantityDelta, reasonComment })
        .returning();

      return {
        id: movement.id,
        controlPartId: movement.controlPartId,
        partNumber: part.partNumber,
        partName: part.name,
        quantityDelta: movement.quantityDelta,
        reasonComment: movement.reasonComment,
        createdAt: movement.createdAt.toISOString(),
        quantityAfter: await currentQuantity(controlPartId),
      };
    },
  );
};
