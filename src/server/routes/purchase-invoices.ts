import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
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
  // A Purchase Invoice is always raised against one or more Goods
  // Receipts that already brought the stock in (handover doc 6.3: "an
  // invoice can be raised from one challan or several combined") — every
  // receipt gets its own purchase_document_links row back to this
  // invoice, mirroring the sales side's Invoice-from-Delivery-Note(s).
  sourceGoodsReceiptIds: z.array(z.string().uuid()).min(1),
  // NOT auto-derived from the source receipts — the client sends the
  // exact lines to bill, since the real invoice quantity/cost can differ
  // from what a receipt recorded (this is the whole reason a Purchase
  // Invoice is its own document rather than a status flip on a receipt).
  // Lines from several receipts stay as separate rows here, one per
  // original receipt line — unlike the sales side's Invoice-from-DN,
  // nothing in the handover doc asks for same-part lines across receipts
  // to merge into one row.
  lines: z.array(invoiceLineSchema).min(1),
});

const invoiceResponseSchema = z.object({
  id: z.string(),
  documentNumber: z.string(),
  subtotalAmount: z.string(),
  totalAmount: z.string(),
});

const errorResponseSchema = z.object({ error: z.string() });

const uninvoicedGrnSchema = z.object({
  id: z.string(),
  documentNumber: z.string(),
  documentDate: z.string(),
  totalAmount: z.string(),
});

/**
 * Purchase Invoice creation — the supplier's actual bill arriving,
 * reconciled against one or more Goods Receipts already recorded
 * (CLAUDE.md section 7: "reconciled later when the actual invoice
 * arrives"; handover doc 6.3: "an invoice can be raised from one challan
 * or several combined" — built 2026-09-13). Created already "posted"
 * (an arrived supplier invoice is a finalized financial event, same
 * reasoning as POS checkout's Invoice being posted immediately) — but
 * deliberately writes NO stock movement of its own, since the linked
 * Goods Receipt(s) already moved stock when THEY were posted. Costs
 * entered here can differ from a receipt's own costs (the actual invoice
 * price vs. an estimated receiving price is a real business scenario),
 * which is exactly why this is its own document with its own lines, not
 * just a status flip on the receipt(s).
 *
 * A Goods Receipt can be billed at most once — reselecting an
 * already-invoiced one is rejected by name, checked via
 * purchase_document_links, mirroring the sales side's Invoice-from-DN.
 * (This guard didn't exist before this pass, when only one receipt could
 * ever be selected at a time; closing it now is a natural side effect of
 * letting several be picked together, not a separate fix.)
 */
export const purchaseInvoicesRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    "/uninvoiced-goods-receipts",
    {
      schema: {
        querystring: z.object({
          legalEntityId: z.string().uuid(),
          partyId: z.string().uuid(),
        }),
        response: { 200: z.array(uninvoicedGrnSchema) },
      },
    },
    async (request) => {
      const { legalEntityId, partyId } = request.query;

      const alreadyInvoiced = await db
        .select({ grnId: purchaseDocumentLinks.fromDocumentId })
        .from(purchaseDocumentLinks)
        .innerJoin(purchaseDocuments, eq(purchaseDocuments.id, purchaseDocumentLinks.toDocumentId))
        .where(eq(purchaseDocuments.documentType, "purchase_invoice"));
      const invoicedIds = alreadyInvoiced.map((r) => r.grnId);

      const rows = await db
        .select({
          id: purchaseDocuments.id,
          documentNumber: purchaseDocuments.documentNumber,
          documentDate: purchaseDocuments.documentDate,
          totalAmount: purchaseDocuments.totalAmount,
        })
        .from(purchaseDocuments)
        .where(
          and(
            eq(purchaseDocuments.documentType, "goods_receipt"),
            eq(purchaseDocuments.status, "posted"),
            eq(purchaseDocuments.legalEntityId, legalEntityId),
            eq(purchaseDocuments.partyId, partyId),
          ),
        )
        .orderBy(purchaseDocuments.documentDate);

      return rows.filter((r) => !invoicedIds.includes(r.id));
    },
  );

  app.post(
    "/",
    { schema: { body: invoiceBodySchema, response: { 200: invoiceResponseSchema, 400: errorResponseSchema } } },
    async (request, reply) => {
      const { legalEntityId, partyId, supplierRef, sourceGoodsReceiptIds, lines } = request.body;

      let subtotal, total;
      try {
        await requireLegalEntity(legalEntityId);
        await requireSupplierParty(partyId);
        await requirePurchasePartsExist(lines);
        ({ subtotal, total } = computePurchaseTotals(lines));

        const sources = await db
          .select()
          .from(purchaseDocuments)
          .where(inArray(purchaseDocuments.id, sourceGoodsReceiptIds));

        if (sources.length !== sourceGoodsReceiptIds.length) {
          throw new PurchaseDocumentValidationError("One or more goods receipts were not found");
        }
        for (const source of sources) {
          if (source.documentType !== "goods_receipt") {
            throw new PurchaseDocumentValidationError(`${source.documentNumber} is not a goods receipt`);
          }
          if (source.legalEntityId !== legalEntityId) {
            throw new PurchaseDocumentValidationError(
              `${source.documentNumber} belongs to a different entity`,
            );
          }
          if (source.partyId !== partyId) {
            throw new PurchaseDocumentValidationError(
              "All selected goods receipts must be from the same supplier",
            );
          }
          if (source.status !== "posted") {
            throw new PurchaseDocumentValidationError(
              `${source.documentNumber} must be posted before it can be invoiced`,
            );
          }
        }

        const existingLinks = await db
          .select({ grnId: purchaseDocumentLinks.fromDocumentId })
          .from(purchaseDocumentLinks)
          .innerJoin(purchaseDocuments, eq(purchaseDocuments.id, purchaseDocumentLinks.toDocumentId))
          .where(
            and(
              eq(purchaseDocuments.documentType, "purchase_invoice"),
              inArray(purchaseDocumentLinks.fromDocumentId, sourceGoodsReceiptIds),
            ),
          );
        if (existingLinks.length > 0) {
          const already = sources.find((s) => s.id === existingLinks[0].grnId);
          throw new PurchaseDocumentValidationError(
            `${already?.documentNumber ?? "One of the selected goods receipts"} has already been invoiced`,
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

        await tx.insert(purchaseDocumentLinks).values(
          sourceGoodsReceiptIds.map((grnId) => ({
            fromDocumentId: grnId,
            toDocumentId: doc.id,
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
