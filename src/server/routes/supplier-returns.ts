import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
  purchaseDocuments,
  purchaseDocumentLines,
  purchaseDocumentLinks,
  stockCostLayers,
} from "../../db/schema/index.js";
import { assignDocumentNumber } from "../services/document-numbers.js";
import {
  requireLegalEntity,
  requireSupplierParty,
  PurchaseDocumentValidationError,
} from "../services/purchase-document-helpers.js";

const returnLineSchema = z.object({
  controlPartId: z.string().uuid(),
  quantity: z.number().int().min(1),
});

const returnBodySchema = z.object({
  legalEntityId: z.string().uuid(),
  partyId: z.string().uuid(),
  // The supplier's own credit note number, if they've issued one yet —
  // free text, same reasoning as supplierRef elsewhere in this chain.
  supplierRef: z.string().max(100).optional(),
  sourceGoodsReceiptId: z.string().uuid(),
  lines: z.array(returnLineSchema).min(1),
});

const returnResponseSchema = z.object({
  id: z.string(),
  documentNumber: z.string(),
  subtotalAmount: z.string(),
  totalAmount: z.string(),
});

const errorResponseSchema = z.object({ error: z.string() });

/**
 * Supplier Return (handover doc 6.3: "a ledger entry linked back to the
 * original purchase voucher, not a free-floating credit note"). Always
 * requires a specific posted Goods Receipt — the "original voucher" —
 * and every line's cost is taken FROM that receipt's own line, never
 * accepted from the client, so the return can't record a cost that never
 * actually happened. Quantity is capped at what's still left of that
 * exact batch (`stock_cost_layers.quantityRemaining`), not the originally
 * received amount — you can't return units that have already been sold.
 *
 * Created `draft`; the real stock effect (decrement + reducing the
 * source receipt's own cost layer) happens on POST, matching the Goods
 * Receipt precedent — see purchases.ts's post/unpost and
 * services/supplier-return-stock.ts.
 */
export const supplierReturnsRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.post(
    "/",
    { schema: { body: returnBodySchema, response: { 200: returnResponseSchema, 400: errorResponseSchema } } },
    async (request, reply) => {
      const { legalEntityId, partyId, supplierRef, sourceGoodsReceiptId, lines } = request.body;

      let resolvedLines: { controlPartId: string; quantity: number; unitCost: number }[];
      try {
        await requireLegalEntity(legalEntityId);
        await requireSupplierParty(partyId);

        const source = await db.query.purchaseDocuments.findFirst({
          where: eq(purchaseDocuments.id, sourceGoodsReceiptId),
        });
        if (!source || source.documentType !== "goods_receipt") {
          throw new PurchaseDocumentValidationError("Source goods receipt not found");
        }
        if (source.legalEntityId !== legalEntityId) {
          throw new PurchaseDocumentValidationError("Source goods receipt belongs to a different entity");
        }
        if (source.partyId !== partyId) {
          throw new PurchaseDocumentValidationError("Source goods receipt belongs to a different supplier");
        }
        if (source.status !== "posted") {
          throw new PurchaseDocumentValidationError("The goods receipt must be posted before anything on it can be returned");
        }

        resolvedLines = [];
        for (const line of lines) {
          const [sourceLine] = await db
            .select({ unitCost: purchaseDocumentLines.unitCost })
            .from(purchaseDocumentLines)
            .where(
              and(
                eq(purchaseDocumentLines.purchaseDocumentId, sourceGoodsReceiptId),
                eq(purchaseDocumentLines.controlPartId, line.controlPartId),
              ),
            );
          if (!sourceLine) {
            throw new PurchaseDocumentValidationError("One or more parts weren't on the original goods receipt");
          }

          const [layer] = await db
            .select({ quantityRemaining: stockCostLayers.quantityRemaining })
            .from(stockCostLayers)
            .where(
              and(
                eq(stockCostLayers.purchaseDocumentId, sourceGoodsReceiptId),
                eq(stockCostLayers.controlPartId, line.controlPartId),
              ),
            );
          if (!layer || line.quantity > layer.quantityRemaining) {
            throw new PurchaseDocumentValidationError(
              `Cannot return more than what's still on hand from that receipt (${layer?.quantityRemaining ?? 0} left)`,
            );
          }

          resolvedLines.push({ controlPartId: line.controlPartId, quantity: line.quantity, unitCost: Number(sourceLine.unitCost) });
        }
      } catch (err) {
        if (err instanceof PurchaseDocumentValidationError) {
          return reply.code(400).send({ error: err.message });
        }
        throw err;
      }

      const subtotal = resolvedLines.reduce((sum, l) => sum + l.quantity * l.unitCost, 0);

      const result = await db.transaction(async (tx) => {
        const documentNumber = await assignDocumentNumber(legalEntityId, "supplier_return", tx);

        const [doc] = await tx
          .insert(purchaseDocuments)
          .values({
            documentType: "supplier_return",
            documentNumber,
            legalEntityId,
            partyId,
            supplierRef,
            documentDate: new Date().toISOString().slice(0, 10),
            subtotalAmount: subtotal.toFixed(2),
            taxTotal: "0",
            totalAmount: subtotal.toFixed(2),
            status: "draft",
          })
          .returning();

        await tx.insert(purchaseDocumentLines).values(
          resolvedLines.map((line, i) => ({
            purchaseDocumentId: doc.id,
            lineNumber: i + 1,
            controlPartId: line.controlPartId,
            quantity: line.quantity,
            unitCost: line.unitCost.toFixed(2),
            lineAmount: (line.quantity * line.unitCost).toFixed(2),
          })),
        );

        await tx.insert(purchaseDocumentLinks).values({
          fromDocumentId: sourceGoodsReceiptId,
          toDocumentId: doc.id,
        });

        return doc;
      });

      return {
        id: result.id,
        documentNumber: result.documentNumber,
        subtotalAmount: result.subtotalAmount,
        totalAmount: result.totalAmount,
      };
    },
  );
};
