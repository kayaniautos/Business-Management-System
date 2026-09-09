import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
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

      const entity = await db.query.legalEntities.findFirst({
        where: eq(legalEntities.id, legalEntityId),
      });
      if (!entity) {
        return reply.code(400).send({ error: "Unknown legal entity" });
      }

      if (partyId) {
        const party = await db.query.parties.findFirst({ where: eq(parties.id, partyId) });
        if (!party) return reply.code(400).send({ error: "Unknown party" });
      }

      if (discounts.length > 0 && entity.name !== "Kiyani Autos") {
        return reply
          .code(400)
          .send({ error: "Discounts are only available for Kiyani Autos sales" });
      }

      const partIds = [...new Set(lines.map((l) => l.controlPartId))];
      const foundParts = await db
        .select({ id: controlParts.id })
        .from(controlParts)
        .where(inArray(controlParts.id, partIds));
      if (foundParts.length !== partIds.length) {
        return reply.code(400).send({ error: "One or more parts were not found" });
      }

      const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.unitGrossPrice, 0);
      const discountTotal = discounts.reduce((sum, d) => sum + d.amount, 0);
      const total = subtotal - discountTotal;
      if (total < 0) {
        return reply.code(400).send({ error: "Discount exceeds the sale total" });
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
