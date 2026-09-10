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

const invoiceLineSchema = z.object({
  controlPartId: z.string().uuid(),
  quantity: z.number().int().min(1),
  unitCost: z.number().min(0),
});

const invoiceBodySchema = z.object({
  legalEntityId: z.string().uuid(),
  partyId: z.string().uuid(),
  // The supplier's own invoice number — the actual reconciliation event
  // this document represents (CLAUDE.md section 7).
  supplierRef: z.string().max(100).optional(),
  // Required: a Purchase Invoice is always raised against a Goods Receipt
  // that already brought the stock in. First pass supports exactly ONE
  // source receipt per invoice — see purchase-documents.ts's header
  // comment for why merging several isn't built yet.
  sourceGoodsReceiptId: z.string().uuid(),
  lines: z.array(invoiceLineSchema).min(1),
});

const invoiceResponseSchema = z.object({
  id: z.string(),
  documentNumber: z.string(),
  subtotalAmount: z.string(),
  totalAmount: z.string(),
});

const errorResponseSchema = z.object({ error: z.string() });

/**
 * First real Purchase Invoice creation — the supplier's actual bill
 * arriving, reconciled against a Goods Receipt already recorded
 * (CLAUDE.md section 7: "reconciled later when the actual invoice
 * arrives"). Created already "posted" (an arrived supplier invoice is a
 * finalized financial event, same reasoning as POS checkout's Invoice
 * being posted immediately) — but deliberately writes NO stock movement
 * of its own, since the linked Goods Receipt already moved stock when
 * IT was posted. Costs entered here can differ from the receipt's
 * costs (the actual invoice price vs. an estimated receiving price is a
 * real business scenario), which is exactly why this is its own document
 * with its own lines, not just a status flip on the receipt.
 */
export const purchaseInvoicesRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.post(
    "/",
    { schema: { body: invoiceBodySchema, response: { 200: invoiceResponseSchema, 400: errorResponseSchema } } },
    async (request, reply) => {
      const { legalEntityId, partyId, supplierRef, sourceGoodsReceiptId, lines } = request.body;

      let subtotal, total;
      try {
        await requireLegalEntity(legalEntityId);
        await requireSupplierParty(partyId);
        await requirePurchasePartsExist(lines);
        ({ subtotal, total } = computePurchaseTotals(lines));

        const source = await db.query.purchaseDocuments.findFirst({
          where: eq(purchaseDocuments.id, sourceGoodsReceiptId),
        });
        if (!source || source.documentType !== "goods_receipt") {
          throw new PurchaseDocumentValidationError("Source goods receipt not found");
        }
        if (source.legalEntityId !== legalEntityId) {
          throw new PurchaseDocumentValidationError(
            "Source goods receipt belongs to a different entity",
          );
        }
        if (source.status !== "posted") {
          throw new PurchaseDocumentValidationError(
            "The goods receipt must be posted before it can be invoiced",
          );
        }
      } catch (err) {
        if (err instanceof PurchaseDocumentValidationError) {
          return reply.code(400).send({ error: err.message });
        }
        throw err;
      }

      const result = await db.transaction(async (tx) => {
        const documentNumber = await assignDocumentNumber(legalEntityId, "purchase_invoice", tx);

        const [doc] = await tx
          .insert(purchaseDocuments)
          .values({
            documentType: "purchase_invoice",
            documentNumber,
            legalEntityId,
            partyId,
            supplierRef,
            documentDate: new Date().toISOString().slice(0, 10),
            subtotalAmount: subtotal.toFixed(2),
            taxTotal: "0",
            totalAmount: total.toFixed(2),
            status: "posted",
            postedAt: new Date(),
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
