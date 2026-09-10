import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { purchaseDocuments, purchaseDocumentLines, purchaseDocumentLinks } from "../../db/schema/index.js";
import { assignDocumentNumber } from "../services/document-numbers.js";
import {
  requireLegalEntity,
  requireSupplierParty,
  requirePurchasePartsExist,
  computePurchaseTotals,
  PurchaseDocumentValidationError,
} from "../services/purchase-document-helpers.js";

const grnLineSchema = z.object({
  controlPartId: z.string().uuid(),
  quantity: z.number().int().min(1),
  unitCost: z.number().min(0),
});

const grnBodySchema = z.object({
  legalEntityId: z.string().uuid(),
  partyId: z.string().uuid(),
  supplierRef: z.string().max(100).optional(),
  // Set when this receipt is (fully or partially) against an existing
  // Purchase Order — CLAUDE.md section 7: "delivery challans support
  // partial deliveries against a single order," so more than one Goods
  // Receipt can link back to the same PO over time.
  sourcePurchaseOrderId: z.string().uuid().optional(),
  lines: z.array(grnLineSchema).min(1),
});

const grnResponseSchema = z.object({
  id: z.string(),
  documentNumber: z.string(),
  subtotalAmount: z.string(),
  totalAmount: z.string(),
});

const errorResponseSchema = z.object({ error: z.string() });

/**
 * First real Goods Receipt creation. Per CLAUDE.md section 7 / handover
 * doc 6.3: goods can be received before the supplier's invoice arrives,
 * recorded here against the supplier's own delivery challan number
 * (`supplierRef`) and reconciled later by a Purchase Invoice. Can be
 * created directly (no PO) or against an existing Purchase Order, picking
 * which lines/quantities were actually delivered — same "selection
 * happens individually" pattern as Delivery Note's "from Quotation" mode.
 *
 * Always created "draft" — the real stock-arrival effect happens on POST
 * (see purchases.ts), matching the Post/Unpost pattern already used for
 * Delivery Notes, not on creation.
 */
export const goodsReceiptsRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.post(
    "/",
    { schema: { body: grnBodySchema, response: { 200: grnResponseSchema, 400: errorResponseSchema } } },
    async (request, reply) => {
      const { legalEntityId, partyId, supplierRef, sourcePurchaseOrderId, lines } = request.body;

      let subtotal, total;
      try {
        await requireLegalEntity(legalEntityId);
        await requireSupplierParty(partyId);
        await requirePurchasePartsExist(lines);
        ({ subtotal, total } = computePurchaseTotals(lines));

        if (sourcePurchaseOrderId) {
          const source = await db.query.purchaseDocuments.findFirst({
            where: eq(purchaseDocuments.id, sourcePurchaseOrderId),
          });
          if (!source || source.documentType !== "purchase_order") {
            throw new PurchaseDocumentValidationError("Source purchase order not found");
          }
          if (source.legalEntityId !== legalEntityId) {
            throw new PurchaseDocumentValidationError(
              "Source purchase order belongs to a different entity",
            );
          }
        }
      } catch (err) {
        if (err instanceof PurchaseDocumentValidationError) {
          return reply.code(400).send({ error: err.message });
        }
        throw err;
      }

      const result = await db.transaction(async (tx) => {
        const documentNumber = await assignDocumentNumber(legalEntityId, "goods_receipt", tx);

        const [doc] = await tx
          .insert(purchaseDocuments)
          .values({
            documentType: "goods_receipt",
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

        if (sourcePurchaseOrderId) {
          await tx.insert(purchaseDocumentLinks).values({
            fromDocumentId: sourcePurchaseOrderId,
            toDocumentId: doc.id,
          });
        }

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
