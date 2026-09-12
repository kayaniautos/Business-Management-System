import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
  purchaseDocuments,
  purchaseDocumentLines,
  legalEntities,
  controlParts,
  parties,
  settlements,
} from "../../db/schema/index.js";
import { applyStockMovementsForPurchaseDocument } from "../services/purchase-stock-movements.js";
import { applyCostLayersForPurchaseDocument } from "../services/lifo-cost-layers.js";
import { applyStockMovementsForSupplierReturn, applyCostLayersForSupplierReturn } from "../services/supplier-return-stock.js";

const purchaseDocumentSummarySchema = z.object({
  id: z.string(),
  documentType: z.string(),
  documentNumber: z.string(),
  entityName: z.string(),
  partyName: z.string(),
  supplierRef: z.string().nullable(),
  documentDate: z.string(),
  subtotalAmount: z.string(),
  totalAmount: z.string(),
  status: z.string(),
});

const purchaseDocumentDetailSchema = purchaseDocumentSummarySchema.extend({
  partyId: z.string(),
  lines: z.array(
    z.object({
      lineNumber: z.number(),
      controlPartId: z.string(),
      partNumber: z.string(),
      catalogName: z.string(),
      quantity: z.number(),
      unitCost: z.string(),
      lineAmount: z.string(),
    }),
  ),
  // Settlements (CLAUDE.md 5.10) recorded against this document — only
  // ever non-empty for a posted Purchase Invoice, since settlements.ts
  // rejects every other document type/status.
  settlements: z.array(
    z.object({
      id: z.string(),
      channel: z.enum(["cash", "easypaisa", "jazzcash", "bank_transfer"]),
      amount: z.string(),
      paymentDate: z.string(),
      referenceNote: z.string().nullable(),
    }),
  ),
  amountPaid: z.string(),
});

const errorResponseSchema = z.object({ error: z.string() });

/**
 * History/detail/post/unpost for the purchase document chain — the
 * purchasing-side counterpart to sales.ts. Kept as one shared route file
 * (not split per document type) for the same reason sales history is:
 * Purchase Order/Goods Receipt/Purchase Invoice all live in one
 * purchase_documents table and share this exact shape.
 */
export const purchasesRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    "/",
    {
      schema: {
        querystring: z.object({
          legalEntityId: z.string().uuid().optional(),
          documentType: z.enum(["purchase_order", "goods_receipt", "purchase_invoice", "supplier_return"]).optional(),
          q: z.string().optional(),
        }),
        response: { 200: z.array(purchaseDocumentSummarySchema) },
      },
    },
    async (request) => {
      const { legalEntityId, documentType, q } = request.query;
      const rows = await db
        .select({
          id: purchaseDocuments.id,
          documentType: purchaseDocuments.documentType,
          documentNumber: purchaseDocuments.documentNumber,
          entityName: legalEntities.name,
          partyName: parties.name,
          supplierRef: purchaseDocuments.supplierRef,
          documentDate: purchaseDocuments.documentDate,
          subtotalAmount: purchaseDocuments.subtotalAmount,
          totalAmount: purchaseDocuments.totalAmount,
          status: purchaseDocuments.status,
        })
        .from(purchaseDocuments)
        .innerJoin(legalEntities, eq(purchaseDocuments.legalEntityId, legalEntities.id))
        .innerJoin(parties, eq(purchaseDocuments.partyId, parties.id))
        .where(
          and(
            legalEntityId ? eq(purchaseDocuments.legalEntityId, legalEntityId) : undefined,
            documentType ? eq(purchaseDocuments.documentType, documentType) : undefined,
            q
              ? or(
                  ilike(purchaseDocuments.documentNumber, `%${q}%`),
                  ilike(parties.name, `%${q}%`),
                )
              : undefined,
          ),
        )
        .orderBy(desc(purchaseDocuments.createdAt))
        .limit(200);

      return rows;
    },
  );

  app.get(
    "/:id",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: purchaseDocumentDetailSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const [header] = await db
        .select({
          id: purchaseDocuments.id,
          documentType: purchaseDocuments.documentType,
          documentNumber: purchaseDocuments.documentNumber,
          entityName: legalEntities.name,
          partyId: purchaseDocuments.partyId,
          partyName: parties.name,
          supplierRef: purchaseDocuments.supplierRef,
          documentDate: purchaseDocuments.documentDate,
          subtotalAmount: purchaseDocuments.subtotalAmount,
          totalAmount: purchaseDocuments.totalAmount,
          status: purchaseDocuments.status,
        })
        .from(purchaseDocuments)
        .innerJoin(legalEntities, eq(purchaseDocuments.legalEntityId, legalEntities.id))
        .innerJoin(parties, eq(purchaseDocuments.partyId, parties.id))
        .where(eq(purchaseDocuments.id, id));

      if (!header) return reply.code(404).send({ error: "Purchase document not found" });

      const lineRows = await db
        .select({
          lineNumber: purchaseDocumentLines.lineNumber,
          controlPartId: purchaseDocumentLines.controlPartId,
          partNumber: controlParts.partNumber,
          catalogName: controlParts.name,
          quantity: purchaseDocumentLines.quantity,
          unitCost: purchaseDocumentLines.unitCost,
          lineAmount: purchaseDocumentLines.lineAmount,
        })
        .from(purchaseDocumentLines)
        .innerJoin(controlParts, eq(purchaseDocumentLines.controlPartId, controlParts.id))
        .where(eq(purchaseDocumentLines.purchaseDocumentId, id))
        .orderBy(purchaseDocumentLines.lineNumber);

      const settlementRows = await db
        .select({
          id: settlements.id,
          channel: settlements.channel,
          amount: settlements.amount,
          paymentDate: settlements.paymentDate,
          referenceNote: settlements.referenceNote,
        })
        .from(settlements)
        .where(eq(settlements.purchaseDocumentId, id))
        .orderBy(settlements.paymentDate, settlements.createdAt);

      const amountPaid = settlementRows.reduce((sum, s) => sum + Number(s.amount), 0);

      return { ...header, lines: lineRows, settlements: settlementRows, amountPaid: amountPaid.toFixed(2) };
    },
  );

  async function summarizeDocument(id: string) {
    const [row] = await db
      .select({
        id: purchaseDocuments.id,
        documentType: purchaseDocuments.documentType,
        documentNumber: purchaseDocuments.documentNumber,
        entityName: legalEntities.name,
        partyName: parties.name,
        supplierRef: purchaseDocuments.supplierRef,
        documentDate: purchaseDocuments.documentDate,
        subtotalAmount: purchaseDocuments.subtotalAmount,
        totalAmount: purchaseDocuments.totalAmount,
        status: purchaseDocuments.status,
      })
      .from(purchaseDocuments)
      .innerJoin(legalEntities, eq(purchaseDocuments.legalEntityId, legalEntities.id))
      .innerJoin(parties, eq(purchaseDocuments.partyId, parties.id))
      .where(eq(purchaseDocuments.id, id));
    return row;
  }

  /**
   * Post/Unpost — allowed for "goods_receipt" and "supplier_return" only,
   * the two document types with a real, reversible stock effect. A
   * Purchase Order is informational, like a Quotation (never posts). A
   * Purchase Invoice is created already "posted" and stays that way —
   * not blocked here out of laziness, but deliberately: unposting it
   * would have no stock effect to reverse (the linked Goods Receipt owns
   * that), so allowing it would create a misleading "unposted invoice"
   * state with nothing behind it.
   */
  function stockEffectFunctionsFor(documentType: string) {
    if (documentType === "goods_receipt") {
      return { movements: applyStockMovementsForPurchaseDocument, layers: applyCostLayersForPurchaseDocument };
    }
    if (documentType === "supplier_return") {
      return { movements: applyStockMovementsForSupplierReturn, layers: applyCostLayersForSupplierReturn };
    }
    return null;
  }

  app.post(
    "/:id/post",
    { schema: { params: z.object({ id: z.string().uuid() }), response: { 200: purchaseDocumentSummarySchema, 400: errorResponseSchema, 404: errorResponseSchema } } },
    async (request, reply) => {
      const doc = await db.query.purchaseDocuments.findFirst({ where: eq(purchaseDocuments.id, request.params.id) });
      if (!doc) return reply.code(404).send({ error: "Purchase document not found" });
      const fns = stockEffectFunctionsFor(doc.documentType);
      if (!fns) {
        return reply.code(400).send({ error: "Only a goods receipt or supplier return can be posted here" });
      }
      if (doc.status === "posted") {
        return reply.code(400).send({ error: "Already posted" });
      }
      await db.transaction(async (tx) => {
        await tx
          .update(purchaseDocuments)
          .set({ status: "posted", postedAt: new Date() })
          .where(eq(purchaseDocuments.id, doc.id));
        await fns.movements(tx, doc.id, 1);
        await fns.layers(tx, doc.id, 1);
      });
      return summarizeDocument(doc.id);
    },
  );

  app.post(
    "/:id/unpost",
    { schema: { params: z.object({ id: z.string().uuid() }), response: { 200: purchaseDocumentSummarySchema, 400: errorResponseSchema, 404: errorResponseSchema } } },
    async (request, reply) => {
      const doc = await db.query.purchaseDocuments.findFirst({ where: eq(purchaseDocuments.id, request.params.id) });
      if (!doc) return reply.code(404).send({ error: "Purchase document not found" });
      const fns = stockEffectFunctionsFor(doc.documentType);
      if (!fns) {
        return reply.code(400).send({ error: "Only a goods receipt or supplier return can be unposted here" });
      }
      if (doc.status !== "posted") {
        return reply.code(400).send({ error: "Only a posted document can be unposted" });
      }
      await db.transaction(async (tx) => {
        await tx.update(purchaseDocuments).set({ status: "unposted" }).where(eq(purchaseDocuments.id, doc.id));
        await fns.movements(tx, doc.id, -1);
        await fns.layers(tx, doc.id, -1);
      });
      return summarizeDocument(doc.id);
    },
  );
};
