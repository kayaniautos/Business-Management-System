import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
  salesDocuments,
  salesDocumentLines,
  salesDocumentDiscounts,
  legalEntities,
  controlParts,
  parties,
} from "../../db/schema/index.js";
import { assignDocumentNumber } from "../services/document-numbers.js";
import {
  requireLegalEntity,
  snapshotPartyTaxInfo,
  requireControlPartsExist,
  computeAndValidateTotals,
  SalesDocumentValidationError,
} from "../services/sales-document-helpers.js";

const checkoutLineSchema = z.object({
  controlPartId: z.string().uuid(),
  quantity: z.number().int().min(1),
  unitGrossPrice: z.number().min(0),
  displayName: z.string().min(1).max(200).optional(),
});

const checkoutDiscountSchema = z.object({
  label: z.string().min(1).max(200),
  amount: z.number().positive(),
});

const checkoutBodySchema = z.object({
  legalEntityId: z.string().uuid(),
  // Walk-in when omitted (CLAUDE.md 5.10 / the POS mockup's "Walk-in
  // customer" default) — partyId stays null on the created document.
  partyId: z.string().uuid().optional(),
  lines: z.array(checkoutLineSchema).min(1),
  // Max 2 per CLAUDE.md 5.10 ("Kiyani Autos only, max 2") — the
  // Kiyani-Autos-only part is checked in the handler, not the schema,
  // since it needs a DB lookup on legalEntityId.
  discounts: z.array(checkoutDiscountSchema).max(2).default([]),
});

const checkoutResponseSchema = z.object({
  id: z.string(),
  documentNumber: z.string(),
  subtotalAmount: z.string(),
  discountTotal: z.string(),
  totalAmount: z.string(),
});

const errorResponseSchema = z.object({ error: z.string() });

const salesDocumentSummarySchema = z.object({
  id: z.string(),
  documentType: z.string(),
  documentNumber: z.string(),
  entityName: z.string(),
  partyName: z.string().nullable(),
  documentDate: z.string(),
  subtotalAmount: z.string(),
  discountTotal: z.string(),
  totalAmount: z.string(),
  status: z.string(),
});

const salesDocumentDetailSchema = salesDocumentSummarySchema.extend({
  // Needed by the "convert from Quotation" flow (delivery-notes.ts's
  // frontend) to pre-select the customer — not on the summary schema,
  // which only needs the display name for the history list.
  partyId: z.string().nullable(),
  lines: z.array(
    z.object({
      lineNumber: z.number(),
      // Needed by the "convert from Quotation" flow to actually submit a
      // valid controlPartId (partNumber/catalogName alone aren't enough
      // to identify the part on the new document).
      controlPartId: z.string(),
      partNumber: z.string(),
      catalogName: z.string(),
      displayName: z.string().nullable(),
      quantity: z.number(),
      unitGrossPrice: z.string(),
      lineGrossAmount: z.string(),
    }),
  ),
  discounts: z.array(z.object({ label: z.string(), amount: z.string() })),
});

/**
 * First real POS checkout: creates an actual `sales_documents` row
 * (type "invoice") with real lines and discounts, immediately posted -
 * a walk-in/counter sale is final at the point of sale, not a draft
 * workflow (CLAUDE.md 5.9's post/unpost pattern is aimed at the
 * Quotation/DN/corporate-invoice document-chain flow, not this).
 *
 * No tax computation (CLAUDE.md 5.10: not built yet - lineTaxAmount and
 * taxTotal are always 0 here). `partyId` is optional - a sale can attach
 * to a real party or stay walk-in (null), matching the POS mockup's
 * "Walk-in customer" default. Amounts are recomputed server-side from
 * quantity * unitGrossPrice, never trusted from the client.
 */
export const salesRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  /**
   * Sales history — first real way to see a sale again after checkout
   * creates it (previously only visible via a direct SQL query). `q`
   * matches document number or party name; newest first.
   */
  app.get(
    "/",
    {
      schema: {
        querystring: z.object({
          legalEntityId: z.string().uuid().optional(),
          documentType: z.enum(["quotation", "delivery_note", "invoice"]).optional(),
          q: z.string().optional(),
        }),
        response: { 200: z.array(salesDocumentSummarySchema) },
      },
    },
    async (request) => {
      const { legalEntityId, documentType, q } = request.query;
      const rows = await db
        .select({
          id: salesDocuments.id,
          documentType: salesDocuments.documentType,
          documentNumber: salesDocuments.documentNumber,
          entityName: legalEntities.name,
          partyName: parties.name,
          documentDate: salesDocuments.documentDate,
          subtotalAmount: salesDocuments.subtotalAmount,
          discountTotal: salesDocuments.discountTotal,
          totalAmount: salesDocuments.totalAmount,
          status: salesDocuments.status,
        })
        .from(salesDocuments)
        .innerJoin(legalEntities, eq(salesDocuments.legalEntityId, legalEntities.id))
        .leftJoin(parties, eq(salesDocuments.partyId, parties.id))
        .where(
          and(
            legalEntityId ? eq(salesDocuments.legalEntityId, legalEntityId) : undefined,
            documentType ? eq(salesDocuments.documentType, documentType) : undefined,
            q
              ? or(
                  ilike(salesDocuments.documentNumber, `%${q}%`),
                  ilike(parties.name, `%${q}%`),
                )
              : undefined,
          ),
        )
        .orderBy(desc(salesDocuments.createdAt))
        .limit(200);

      return rows;
    },
  );

  app.get(
    "/:id",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: salesDocumentDetailSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const [header] = await db
        .select({
          id: salesDocuments.id,
          documentType: salesDocuments.documentType,
          documentNumber: salesDocuments.documentNumber,
          entityName: legalEntities.name,
          partyId: salesDocuments.partyId,
          partyName: parties.name,
          documentDate: salesDocuments.documentDate,
          subtotalAmount: salesDocuments.subtotalAmount,
          discountTotal: salesDocuments.discountTotal,
          totalAmount: salesDocuments.totalAmount,
          status: salesDocuments.status,
        })
        .from(salesDocuments)
        .innerJoin(legalEntities, eq(salesDocuments.legalEntityId, legalEntities.id))
        .leftJoin(parties, eq(salesDocuments.partyId, parties.id))
        .where(eq(salesDocuments.id, id));

      if (!header) return reply.code(404).send({ error: "Sale not found" });

      const lineRows = await db
        .select({
          lineNumber: salesDocumentLines.lineNumber,
          controlPartId: controlParts.id,
          partNumber: controlParts.partNumber,
          catalogName: controlParts.name,
          displayName: salesDocumentLines.displayName,
          quantity: salesDocumentLines.quantity,
          unitGrossPrice: salesDocumentLines.unitGrossPrice,
          lineGrossAmount: salesDocumentLines.lineGrossAmount,
        })
        .from(salesDocumentLines)
        .innerJoin(controlParts, eq(salesDocumentLines.controlPartId, controlParts.id))
        .where(eq(salesDocumentLines.salesDocumentId, id))
        .orderBy(salesDocumentLines.lineNumber);

      const discountRows = await db
        .select({ label: salesDocumentDiscounts.label, amount: salesDocumentDiscounts.amount })
        .from(salesDocumentDiscounts)
        .where(eq(salesDocumentDiscounts.salesDocumentId, id));

      return { ...header, lines: lineRows, discounts: discountRows };
    },
  );

  /**
   * Post/Unpost (CLAUDE.md 5.9): applies to every transactional document
   * except Quotation, which never posts (handled in quotations.ts by
   * simply never setting status to "posted"). Generic here, not DN-
   * specific, since the pattern applies to any sales_documents row - the
   * first real user of this is Delivery Notes, since Invoice (checkout)
   * posts itself immediately and Quotation never posts.
   *
   * `unposted` is a distinct status from `draft` (not just "un-posted
   * back to draft") - it's meant to preserve that the document WAS
   * posted at some point, for audit purposes (CLAUDE.md 2.6). `postedAt`
   * is deliberately left as-is on unpost (the historical record of when
   * it was posted), not cleared - there's no `unpostedAt` column to
   * record the reversal time, a gap worth knowing about, not fixed here.
   */
  app.post(
    "/:id/post",
    { schema: { params: z.object({ id: z.string().uuid() }), response: { 200: salesDocumentSummarySchema, 400: errorResponseSchema, 404: errorResponseSchema } } },
    async (request, reply) => {
      const doc = await db.query.salesDocuments.findFirst({ where: eq(salesDocuments.id, request.params.id) });
      if (!doc) return reply.code(404).send({ error: "Document not found" });
      if (doc.documentType === "quotation") {
        return reply.code(400).send({ error: "Quotations are informational and are never posted" });
      }
      if (doc.status === "posted") {
        return reply.code(400).send({ error: "Already posted" });
      }
      await db
        .update(salesDocuments)
        .set({ status: "posted", postedAt: new Date() })
        .where(eq(salesDocuments.id, doc.id));
      return summarizeDocument(doc.id);
    },
  );

  app.post(
    "/:id/unpost",
    { schema: { params: z.object({ id: z.string().uuid() }), response: { 200: salesDocumentSummarySchema, 400: errorResponseSchema, 404: errorResponseSchema } } },
    async (request, reply) => {
      const doc = await db.query.salesDocuments.findFirst({ where: eq(salesDocuments.id, request.params.id) });
      if (!doc) return reply.code(404).send({ error: "Document not found" });
      if (doc.status !== "posted") {
        return reply.code(400).send({ error: "Only a posted document can be unposted" });
      }
      await db.update(salesDocuments).set({ status: "unposted" }).where(eq(salesDocuments.id, doc.id));
      return summarizeDocument(doc.id);
    },
  );

  async function summarizeDocument(id: string) {
    const [row] = await db
      .select({
        id: salesDocuments.id,
        documentType: salesDocuments.documentType,
        documentNumber: salesDocuments.documentNumber,
        entityName: legalEntities.name,
        partyName: parties.name,
        documentDate: salesDocuments.documentDate,
        subtotalAmount: salesDocuments.subtotalAmount,
        discountTotal: salesDocuments.discountTotal,
        totalAmount: salesDocuments.totalAmount,
        status: salesDocuments.status,
      })
      .from(salesDocuments)
      .innerJoin(legalEntities, eq(salesDocuments.legalEntityId, legalEntities.id))
      .leftJoin(parties, eq(salesDocuments.partyId, parties.id))
      .where(eq(salesDocuments.id, id));
    return row;
  }

  app.post(
    "/checkout",
    {
      schema: {
        body: checkoutBodySchema,
        response: { 200: checkoutResponseSchema, 400: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const { legalEntityId, partyId, lines, discounts } = request.body;

      let entity, subtotal, discountTotal, total;
      try {
        entity = await requireLegalEntity(legalEntityId);
        await snapshotPartyTaxInfo(partyId);
        await requireControlPartsExist(lines);
        ({ subtotal, discountTotal, total } = computeAndValidateTotals(
          entity.name,
          lines,
          discounts,
        ));
      } catch (err) {
        if (err instanceof SalesDocumentValidationError) {
          return reply.code(400).send({ error: err.message });
        }
        throw err;
      }

      const result = await db.transaction(async (tx) => {
        const documentNumber = await assignDocumentNumber(legalEntityId, "invoice", tx);

        const [doc] = await tx
          .insert(salesDocuments)
          .values({
            documentType: "invoice",
            documentNumber,
            legalEntityId,
            partyId,
            documentDate: new Date().toISOString().slice(0, 10),
            subtotalAmount: subtotal.toFixed(2),
            discountTotal: discountTotal.toFixed(2),
            taxTotal: "0",
            totalAmount: total.toFixed(2),
            status: "posted",
            postedAt: new Date(),
          })
          .returning();

        await tx.insert(salesDocumentLines).values(
          lines.map((line, i) => ({
            salesDocumentId: doc.id,
            lineNumber: i + 1,
            controlPartId: line.controlPartId,
            displayName: line.displayName,
            quantity: line.quantity,
            unitGrossPrice: line.unitGrossPrice.toFixed(2),
            lineGrossAmount: (line.quantity * line.unitGrossPrice).toFixed(2),
            lineTaxAmount: "0",
          })),
        );

        if (discounts.length > 0) {
          await tx.insert(salesDocumentDiscounts).values(
            discounts.map((d) => ({
              salesDocumentId: doc.id,
              label: d.label,
              amount: d.amount.toFixed(2),
            })),
          );
        }

        return doc;
      });

      return {
        id: result.id,
        documentNumber: result.documentNumber,
        subtotalAmount: result.subtotalAmount,
        discountTotal: result.discountTotal,
        totalAmount: result.totalAmount,
      };
    },
  );
};
