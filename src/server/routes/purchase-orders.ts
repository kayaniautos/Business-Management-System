import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { db } from "../../db/client.js";
import { purchaseDocuments, purchaseDocumentLines } from "../../db/schema/index.js";
import { assignDocumentNumber } from "../services/document-numbers.js";
import {
  requireLegalEntity,
  requireSupplierParty,
  requirePurchasePartsExist,
  computePurchaseTotals,
  PurchaseDocumentValidationError,
} from "../services/purchase-document-helpers.js";

const poLineSchema = z.object({
  controlPartId: z.string().uuid(),
  quantity: z.number().int().min(1),
  unitCost: z.number().min(0),
});

const poBodySchema = z.object({
  legalEntityId: z.string().uuid(),
  partyId: z.string().uuid(),
  supplierRef: z.string().max(100).optional(),
  lines: z.array(poLineSchema).min(1),
});

const poResponseSchema = z.object({
  id: z.string(),
  documentNumber: z.string(),
  subtotalAmount: z.string(),
  totalAmount: z.string(),
});

const errorResponseSchema = z.object({ error: z.string() });

/**
 * First real Purchase Order creation (CLAUDE.md section 7 / handover doc
 * 6.3). Like a Quotation on the sales side, this is purely informational —
 * nothing has physically arrived yet, so it's always "draft" and never
 * posted, and has zero stock effect. It exists to record what was ordered,
 * from whom, and at what price, ahead of a Goods Receipt.
 */
export const purchaseOrdersRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.post(
    "/",
    { schema: { body: poBodySchema, response: { 200: poResponseSchema, 400: errorResponseSchema } } },
    async (request, reply) => {
      const { legalEntityId, partyId, supplierRef, lines } = request.body;

      let subtotal, total;
      try {
        await requireLegalEntity(legalEntityId);
        await requireSupplierParty(partyId);
        await requirePurchasePartsExist(lines);
        ({ subtotal, total } = computePurchaseTotals(lines));
      } catch (err) {
        if (err instanceof PurchaseDocumentValidationError) {
          return reply.code(400).send({ error: err.message });
        }
        throw err;
      }

      const result = await db.transaction(async (tx) => {
        const documentNumber = await assignDocumentNumber(legalEntityId, "purchase_order", tx);

        const [doc] = await tx
          .insert(purchaseDocuments)
          .values({
            documentType: "purchase_order",
            documentNumber,
            legalEntityId,
            partyId,
            supplierRef,
            documentDate: new Date().toISOString().slice(0, 10),
            subtotalAmount: subtotal.toFixed(2),
            taxTotal: "0",
            totalAmount: total.toFixed(2),
            status: "draft",
          })
          .returning();

        await tx.insert(purchaseDocumentLines).values(
          lines.map((line, i) => ({
            purchaseDocumentId: doc.id,
            lineNumber: i + 1,
            controlPartId: line.controlPartId,
            quantity: line.quantity,
            unitCost: line.unitCost.toFixed(2),
            lineAmount: (line.quantity * line.unitCost).toFixed(2),
          })),
        );

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
