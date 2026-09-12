import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { settlements, salesDocuments, purchaseDocuments } from "../../db/schema/index.js";

const channelSchema = z.enum(["cash", "easypaisa", "jazzcash", "bank_transfer"]);

const settlementResponseSchema = z.object({
  id: z.string(),
  salesDocumentId: z.string().nullable(),
  purchaseDocumentId: z.string().nullable(),
  channel: channelSchema,
  amount: z.string(),
  paymentDate: z.string(),
  referenceNote: z.string().nullable(),
});

const errorResponseSchema = z.object({ error: z.string() });

/**
 * Settlement channels (CLAUDE.md 5.10) — see settlements.ts's own schema
 * comment for the full reasoning. A settlement only ever attaches to a
 * document that's actually a bill: a sales Invoice or a Purchase
 * Invoice, and only once posted (an unposted/draft document, or a
 * Quotation/DN/PO/Goods Receipt, isn't a finalized financial commitment
 * yet — nothing to record a payment against).
 */
export const settlementsRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    "/",
    {
      schema: {
        querystring: z
          .object({
            salesDocumentId: z.string().uuid().optional(),
            purchaseDocumentId: z.string().uuid().optional(),
          })
          .refine((v) => Boolean(v.salesDocumentId) !== Boolean(v.purchaseDocumentId), {
            message: "Provide exactly one of salesDocumentId or purchaseDocumentId",
          }),
        response: { 200: z.array(settlementResponseSchema) },
      },
    },
    async (request) => {
      const { salesDocumentId, purchaseDocumentId } = request.query;
      return db
        .select()
        .from(settlements)
        .where(
          salesDocumentId
            ? eq(settlements.salesDocumentId, salesDocumentId)
            : eq(settlements.purchaseDocumentId, purchaseDocumentId!),
        )
        .orderBy(asc(settlements.paymentDate), asc(settlements.createdAt));
    },
  );

  app.post(
    "/",
    {
      schema: {
        body: z
          .object({
            salesDocumentId: z.string().uuid().optional(),
            purchaseDocumentId: z.string().uuid().optional(),
            channel: channelSchema,
            amount: z.number().positive(),
            paymentDate: z.string().date().optional(),
            referenceNote: z.string().max(200).optional(),
          })
          .refine((v) => Boolean(v.salesDocumentId) !== Boolean(v.purchaseDocumentId), {
            message: "Provide exactly one of salesDocumentId or purchaseDocumentId",
          }),
        response: { 200: settlementResponseSchema, 400: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const { salesDocumentId, purchaseDocumentId, channel, amount, paymentDate, referenceNote } = request.body;

      if (salesDocumentId) {
        const doc = await db.query.salesDocuments.findFirst({ where: eq(salesDocuments.id, salesDocumentId) });
        if (!doc) return reply.code(400).send({ error: "Sale not found" });
        if (doc.documentType !== "invoice") {
          return reply.code(400).send({ error: "Only an Invoice can have a payment recorded against it" });
        }
        if (doc.status !== "posted") {
          return reply.code(400).send({ error: "The invoice must be posted before recording a payment" });
        }
      } else {
        const doc = await db.query.purchaseDocuments.findFirst({ where: eq(purchaseDocuments.id, purchaseDocumentId!) });
        if (!doc) return reply.code(400).send({ error: "Purchase document not found" });
        if (doc.documentType !== "purchase_invoice") {
          return reply.code(400).send({ error: "Only a Purchase Invoice can have a payment recorded against it" });
        }
        if (doc.status !== "posted") {
          return reply.code(400).send({ error: "The purchase invoice must be posted before recording a payment" });
        }
      }

      const [row] = await db
        .insert(settlements)
        .values({
          salesDocumentId,
          purchaseDocumentId,
          channel,
          amount: amount.toFixed(2),
          paymentDate: paymentDate ?? new Date().toISOString().slice(0, 10),
          referenceNote,
        })
        .returning();

      return row;
    },
  );

  app.delete(
    "/:id",
    { schema: { params: z.object({ id: z.string().uuid() }) } },
    async (request, reply) => {
      await db.delete(settlements).where(eq(settlements.id, request.params.id));
      return reply.code(204).send();
    },
  );
};
