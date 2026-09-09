import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { db } from "../../db/client.js";
import { salesDocuments, salesDocumentLines, salesDocumentDiscounts } from "../../db/schema/index.js";
import { assignDocumentNumber } from "../services/document-numbers.js";
import {
  requireLegalEntity,
  snapshotPartyTaxInfo,
  requireControlPartsExist,
  computeAndValidateTotals,
  SalesDocumentValidationError,
} from "../services/sales-document-helpers.js";

const quotationLineSchema = z.object({
  controlPartId: z.string().uuid(),
  quantity: z.number().int().min(1),
  unitGrossPrice: z.number().min(0),
  displayName: z.string().min(1).max(200).optional(),
});

const quotationDiscountSchema = z.object({
  label: z.string().min(1).max(200),
  amount: z.number().positive(),
});

const quotationBodySchema = z.object({
  legalEntityId: z.string().uuid(),
  partyId: z.string().uuid().optional(),
  customerRef: z.string().max(100).optional(),
  ourRefNo: z.string().max(100).optional(),
  vehicleDetails: z.string().max(2000).optional(),
  poNo: z.string().max(100).optional(),
  validUntil: z.string().date().optional(),
  lines: z.array(quotationLineSchema).min(1),
  // Not explicitly specified for Quotation in CLAUDE.md 5.10 (the
  // Kiyani-Autos-only discount rule is described for a "sale," i.e.
  // checkout) — reused here for consistency with the identical-behavior
  // convention across the document chain (5.9). Flagged, not confirmed.
  discounts: z.array(quotationDiscountSchema).max(2).default([]),
});

const quotationResponseSchema = z.object({
  id: z.string(),
  documentNumber: z.string(),
  subtotalAmount: z.string(),
  discountTotal: z.string(),
  totalAmount: z.string(),
});

const errorResponseSchema = z.object({ error: z.string() });

/**
 * First real Quotation creation. Per CLAUDE.md 5.10/handover 8.1: "just a
 * subsidiary record and requires no accounting" — the one document in the
 * chain that does NOT follow the post/unpost pattern. Modeled here as
 * always `status: "draft"`, never posted, never given a `postedAt` -
 * there's no accounting/stock effect to finalize.
 *
 * [unclear — confirm] Whether a Quotation requires a party or can be
 * walk-in like an Invoice - left optional (matching Invoice) rather than
 * guessing that quotations are always tied to a specific customer.
 *
 * customerGstNo/customerNtnNo are snapshotted from the party at creation
 * time (same as checkout), per the "auto-filled from Party record" spec.
 */
export const quotationsRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.post(
    "/",
    {
      schema: {
        body: quotationBodySchema,
        response: { 200: quotationResponseSchema, 400: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const {
        legalEntityId,
        partyId,
        customerRef,
        ourRefNo,
        vehicleDetails,
        poNo,
        validUntil,
        lines,
        discounts,
      } = request.body;

      let entity, customerGstNo, customerNtnNo, subtotal, discountTotal, total;
      try {
        entity = await requireLegalEntity(legalEntityId);
        ({ customerGstNo, customerNtnNo } = await snapshotPartyTaxInfo(partyId));
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
        const documentNumber = await assignDocumentNumber(legalEntityId, "quotation", tx);

        const [doc] = await tx
          .insert(salesDocuments)
          .values({
            documentType: "quotation",
            documentNumber,
            legalEntityId,
            partyId,
            customerRef,
            ourRefNo,
            vehicleDetails,
            poNo,
            customerGstNo,
            customerNtnNo,
            validUntil,
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
