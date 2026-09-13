import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
  salesDocuments,
  salesDocumentLines,
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
import { evaluateAndFlagMarginForDocument } from "../services/margin.js";

const errorResponseSchema = z.object({ error: z.string() });

const uninvoicedDnSchema = z.object({
  id: z.string(),
  documentNumber: z.string(),
  documentDate: z.string(),
  totalAmount: z.string(),
});

/**
 * Raising a real Invoice from one or more already-posted Delivery Notes
 * (CLAUDE.md 5.10: "An Invoice can draw from one DN or several combined")
 * — until now the only way to create an Invoice was POS checkout, which
 * has no path for KT's confirmed credit-sale flow ("settled invoice-wise").
 * No schema change needed — `sales_document_links` was built many-to-many
 * from the start specifically anticipating this.
 *
 * The new Invoice writes NO stock movement of its own: the source DN(s)
 * already decremented stock when THEY were posted (services/stock-
 * movements.ts). This mirrors the Purchase Invoice / Goods Receipt
 * relationship exactly — an Invoice-from-DN just formalizes a delivery
 * that already happened, same as a Purchase Invoice records a bill for
 * stock a Goods Receipt already brought in.
 *
 * A DN can be invoiced at most once — selecting it again is rejected
 * (checked via sales_document_links) rather than allowing partial,
 * per-line re-invoicing across multiple Invoices. Simpler than tracking
 * an "invoiced quantity" per DN line, and nothing in the client's notes
 * asks for partial invoicing of one DN across several Invoices, only for
 * combining several WHOLE DNs onto one Invoice.
 *
 * "Merging the same item across multiple DNs onto one invoice line"
 * (CLAUDE.md 5.10) is implemented narrowly: lines are merged only when
 * both the control part AND the unit price match exactly, since a
 * mismatched price can't collapse into one line without inventing a
 * blended-price rule nobody asked for.
 *
 * `[unclear — confirm]` discount lines on a source DN are NOT carried
 * forward onto the Invoice in this pass — a discount decision already
 * made on the DN isn't re-litigated here, but if the client actually
 * wants those preserved through to the Invoice, this needs revisiting.
 */
export const invoicesRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    "/uninvoiced-delivery-notes",
    {
      schema: {
        querystring: z.object({
          legalEntityId: z.string().uuid(),
          partyId: z.string().uuid().optional(),
        }),
        response: { 200: z.array(uninvoicedDnSchema) },
      },
    },
    async (request) => {
      const { legalEntityId, partyId } = request.query;

      const alreadyInvoiced = await db
        .select({ dnId: salesDocumentLinks.fromDocumentId })
        .from(salesDocumentLinks)
        .innerJoin(salesDocuments, eq(salesDocuments.id, salesDocumentLinks.toDocumentId))
        .where(eq(salesDocuments.documentType, "invoice"));
      const invoicedIds = alreadyInvoiced.map((r) => r.dnId);

      const rows = await db
        .select({
          id: salesDocuments.id,
          documentNumber: salesDocuments.documentNumber,
          documentDate: salesDocuments.documentDate,
          totalAmount: salesDocuments.totalAmount,
        })
        .from(salesDocuments)
        .where(
          and(
            eq(salesDocuments.documentType, "delivery_note"),
            eq(salesDocuments.status, "posted"),
            eq(salesDocuments.legalEntityId, legalEntityId),
            partyId ? eq(salesDocuments.partyId, partyId) : isNull(salesDocuments.partyId),
          ),
        )
        .orderBy(salesDocuments.documentDate);

      return rows.filter((r) => !invoicedIds.includes(r.id));
    },
  );

  app.post(
    "/",
    {
      schema: {
        body: z.object({ sourceDeliveryNoteIds: z.array(z.string().uuid()).min(1) }),
        response: {
          200: z.object({
            id: z.string(),
            documentNumber: z.string(),
            subtotalAmount: z.string(),
            totalAmount: z.string(),
            sourceDeliveryNoteNumbers: z.array(z.string()),
          }),
          400: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { sourceDeliveryNoteIds } = request.body;

      try {
        const sources = await db
          .select()
          .from(salesDocuments)
          .where(inArray(salesDocuments.id, sourceDeliveryNoteIds));

        if (sources.length !== sourceDeliveryNoteIds.length) {
          throw new SalesDocumentValidationError("One or more delivery notes were not found");
        }
        for (const dn of sources) {
          if (dn.documentType !== "delivery_note") {
            throw new SalesDocumentValidationError(
              `${dn.documentNumber} is not a delivery note`,
            );
          }
          if (dn.status !== "posted") {
            throw new SalesDocumentValidationError(
              `${dn.documentNumber} must be posted before it can be invoiced`,
            );
          }
        }

        const first = sources[0];
        for (const dn of sources) {
          if (dn.legalEntityId !== first.legalEntityId || dn.partyId !== first.partyId) {
            throw new SalesDocumentValidationError(
              "All selected delivery notes must be for the same entity and customer",
            );
          }
        }

        const existingLinks = await db
          .select({ dnId: salesDocumentLinks.fromDocumentId })
          .from(salesDocumentLinks)
          .innerJoin(salesDocuments, eq(salesDocuments.id, salesDocumentLinks.toDocumentId))
          .where(
            and(
              eq(salesDocuments.documentType, "invoice"),
              inArray(salesDocumentLinks.fromDocumentId, sourceDeliveryNoteIds),
            ),
          );
        if (existingLinks.length > 0) {
          const already = sources.find((s) => s.id === existingLinks[0].dnId);
          throw new SalesDocumentValidationError(
            `${already?.documentNumber ?? "One of the selected delivery notes"} has already been invoiced`,
          );
        }

        const entity = await requireLegalEntity(first.legalEntityId);
        const { customerGstNo, customerNtnNo } = await snapshotPartyTaxInfo(
          first.partyId ?? undefined,
        );

        const dnLines = await db
          .select({
            controlPartId: salesDocumentLines.controlPartId,
            quantity: salesDocumentLines.quantity,
            unitGrossPrice: salesDocumentLines.unitGrossPrice,
            displayName: salesDocumentLines.displayName,
          })
          .from(salesDocumentLines)
          .where(inArray(salesDocumentLines.salesDocumentId, sourceDeliveryNoteIds));

        // Merge lines that share the same part AND unit price into one
        // summed-quantity line — see the file-header comment for why a
        // price mismatch is kept as separate lines instead.
        const merged = new Map<
          string,
          { controlPartId: string; quantity: number; unitGrossPrice: number; displayName: string | null }
        >();
        for (const line of dnLines) {
          if (!line.controlPartId) continue; // DN lines are never Deal Parts
          const key = `${line.controlPartId}::${line.unitGrossPrice}`;
          const existing = merged.get(key);
          if (existing) {
            existing.quantity += line.quantity;
          } else {
            merged.set(key, {
              controlPartId: line.controlPartId,
              quantity: line.quantity,
              unitGrossPrice: Number(line.unitGrossPrice),
              displayName: line.displayName,
            });
          }
        }
        const mergedLines = [...merged.values()];
        if (mergedLines.length === 0) {
          throw new SalesDocumentValidationError("Selected delivery notes have no lines to invoice");
        }

        await requireControlPartsExist(mergedLines);
        const { subtotal, discountTotal, total } = computeAndValidateTotals(
          entity.name,
          mergedLines,
          [],
        );

        const result = await db.transaction(async (tx) => {
          const documentNumber = await assignDocumentNumber(first.legalEntityId, "invoice", tx);

          const [doc] = await tx
            .insert(salesDocuments)
            .values({
              documentType: "invoice",
              documentNumber,
              legalEntityId: first.legalEntityId,
              partyId: first.partyId,
              customerGstNo,
              customerNtnNo,
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
            mergedLines.map((line, i) => ({
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

          await tx.insert(salesDocumentLinks).values(
            sourceDeliveryNoteIds.map((dnId) => ({
              fromDocumentId: dnId,
              toDocumentId: doc.id,
            })),
          );

          // Deliberately NOT calling applyStockMovementsForDocument here —
          // the source DN(s) already moved stock when they were posted.
          // See the file-header comment.
          await evaluateAndFlagMarginForDocument(tx, doc.id);

          return doc;
        });

        return {
          id: result.id,
          documentNumber: result.documentNumber,
          subtotalAmount: result.subtotalAmount,
          totalAmount: result.totalAmount,
          sourceDeliveryNoteNumbers: sources.map((s) => s.documentNumber),
        };
      } catch (err) {
        if (err instanceof SalesDocumentValidationError) {
          return reply.code(400).send({ error: err.message });
        }
        throw err;
      }
    },
  );
};
