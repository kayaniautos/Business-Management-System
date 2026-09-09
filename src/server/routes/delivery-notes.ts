import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
  salesDocuments,
  salesDocumentLines,
  salesDocumentDiscounts,
  salesDocumentLinks,
} from "../../db/schema/index.js";
import { assignDocumentNumber } from "../services/document-numbers.js";
import {
  requireLegalEntity,
  snapshotPartyTaxInfo,
  requireControlPartsExist,
  computeAndValidateTotals,
  SalesDocumentValidationError,
} from "../services/sales-document-helpers.js";

const dnLineSchema = z.object({
  controlPartId: z.string().uuid(),
  quantity: z.number().int().min(1),
  unitGrossPrice: z.number().min(0),
  displayName: z.string().min(1).max(200).optional(),
});

const dnDiscountSchema = z.object({
  label: z.string().min(1).max(200),
  amount: z.number().positive(),
});

const dnBodySchema = z.object({
  legalEntityId: z.string().uuid(),
  partyId: z.string().uuid().optional(),
  customerRef: z.string().max(100).optional(),
  ourRefNo: z.string().max(100).optional(),
  vehicleDetails: z.string().max(2000).optional(),
  poNo: z.string().max(100).optional(),
  // Set when the DN is prepared from an existing Quotation, carrying only
  // the lines the client picked - CLAUDE.md 5.10/handover 8.2: "selection
  // of items happens individually," not the whole quotation. Omitted for
  // a DN prepared directly ("DNs can be prepared directly as a first
  // step" - same source).
  sourceQuotationId: z.string().uuid().optional(),
  lines: z.array(dnLineSchema).min(1),
  discounts: z.array(dnDiscountSchema).max(2).default([]),
});

const dnResponseSchema = z.object({
  id: z.string(),
  documentNumber: z.string(),
  subtotalAmount: z.string(),
  discountTotal: z.string(),
  totalAmount: z.string(),
});

const errorResponseSchema = z.object({ error: z.string() });

/**
 * First real Delivery Note creation. Unlike Quotation (always "draft",
 * never posted) and Invoice-via-checkout (always immediately "posted"),
 * a DN genuinely needs both states as separate user actions - it's
 * created as "draft" here and posted/unposted via the generic
 * POST /api/sales/:id/post and /:id/unpost endpoints (sales.ts).
 *
 * `sourceQuotationId`, when given, records the link via
 * `sales_document_links` (many-to-many by design, in anticipation of an
 * Invoice later merging several DNs the same way) rather than a plain FK
 * column on this table.
 */
export const deliveryNotesRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.post(
    "/",
    { schema: { body: dnBodySchema, response: { 200: dnResponseSchema, 400: errorResponseSchema } } },
    async (request, reply) => {
      const {
        legalEntityId,
        partyId,
        customerRef,
        ourRefNo,
        vehicleDetails,
        poNo,
        sourceQuotationId,
        lines,
        discounts,
      } = request.body;

      let entity, customerGstNo, customerNtnNo, subtotal, discountTotal, total;
      try {
        entity = await requireLegalEntity(legalEntityId);
        ({ customerGstNo, customerNtnNo } = await snapshotPartyTaxInfo(partyId));
        await requireControlPartsExist(lines);
        ({ subtotal, discountTotal, total } = computeAndValidateTotals(entity.name, lines, discounts));

        if (sourceQuotationId) {
          const source = await db.query.salesDocuments.findFirst({
            where: eq(salesDocuments.id, sourceQuotationId),
          });
          if (!source || source.documentType !== "quotation") {
            throw new SalesDocumentValidationError("Source quotation not found");
          }
          if (source.legalEntityId !== legalEntityId) {
            throw new SalesDocumentValidationError(
              "Source quotation belongs to a different entity",
            );
          }
        }
      } catch (err) {
        if (err instanceof SalesDocumentValidationError) {
          return reply.code(400).send({ error: err.message });
        }
        throw err;
      }

      const result = await db.transaction(async (tx) => {
        const documentNumber = await assignDocumentNumber(legalEntityId, "delivery_note", tx);

        const [doc] = await tx
          .insert(salesDocuments)
          .values({
            documentType: "delivery_note",
            documentNumber,
            legalEntityId,
            partyId,
            customerRef,
            ourRefNo,
            vehicleDetails,
            poNo,
            customerGstNo,
            customerNtnNo,
            documentDate: new Date().toISOString().slice(0, 10),
            subtotalAmount: subtotal.toFixed(2),
            discountTotal: discountTotal.toFixed(2),
            taxTotal: "0",
            totalAmount: total.toFixed(2),
            status: "draft",
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

        if (sourceQuotationId) {
          await tx.insert(salesDocumentLinks).values({
            fromDocumentId: sourceQuotationId,
            toDocumentId: doc.id,
          });
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
