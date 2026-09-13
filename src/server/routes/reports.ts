import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
  salesDocumentLines,
  salesDocuments,
  legalEntities,
  parties,
  controlParts,
} from "../../db/schema/index.js";

const marginOverrideRowSchema = z.object({
  documentNumber: z.string(),
  documentDate: z.string(),
  entityName: z.string(),
  partyName: z.string().nullable(),
  partNumber: z.string(),
  catalogName: z.string(),
  quantity: z.number(),
  unitGrossPrice: z.string(),
  unitCostAtSale: z.string().nullable(),
  marginPercent: z.number().nullable(),
});

/**
 * Margin-override log (CLAUDE.md 5.10: "a margin-override log report
 * should exist"). Every row here is a real, posted sales line whose
 * margin fell below the configured band (services/margin.ts) at the
 * moment its stock moved — this endpoint doesn't recompute anything, it
 * just lists what was already flagged.
 *
 * Scoped to POSTED documents only, matching the client's own "posted
 * lines outside the band get a persistent highlight" framing — a draft
 * Delivery Note can carry a flagged line internally (evaluated when it's
 * eventually posted, not before), but it isn't a real committed sale
 * yet, so it doesn't belong in this log.
 *
 * `[unclear — confirm]` no approval/click-through step exists before a
 * flagged sale proceeds — CLAUDE.md 5.10 itself only confirms "soft
 * warning... not a hard block," not whether an override needs sign-off.
 * This log is the "after the fact visibility" half of that spec line;
 * an approval gate isn't built since nothing in the client's notes asks
 * for one specifically here, and CLAUDE.md 5.8 already flags per-role
 * approval requirements as a broader, still-open Authority Levels
 * question — this doesn't invent an answer for margin overrides alone.
 */
export const reportsRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    "/margin-overrides",
    {
      schema: {
        querystring: z.object({ legalEntityId: z.string().uuid().optional() }),
        response: { 200: z.array(marginOverrideRowSchema) },
      },
    },
    async (request) => {
      const { legalEntityId } = request.query;

      const rows = await db
        .select({
          documentNumber: salesDocuments.documentNumber,
          documentDate: salesDocuments.documentDate,
          entityName: legalEntities.name,
          partyName: parties.name,
          partNumber: controlParts.partNumber,
          catalogName: controlParts.name,
          quantity: salesDocumentLines.quantity,
          unitGrossPrice: salesDocumentLines.unitGrossPrice,
          unitCostAtSale: salesDocumentLines.unitCostAtSale,
        })
        .from(salesDocumentLines)
        .innerJoin(salesDocuments, eq(salesDocumentLines.salesDocumentId, salesDocuments.id))
        .innerJoin(legalEntities, eq(salesDocuments.legalEntityId, legalEntities.id))
        .leftJoin(parties, eq(salesDocuments.partyId, parties.id))
        .innerJoin(controlParts, eq(salesDocumentLines.controlPartId, controlParts.id))
        .where(
          and(
            eq(salesDocumentLines.belowMarginBand, true),
            eq(salesDocuments.status, "posted"),
            legalEntityId ? eq(salesDocuments.legalEntityId, legalEntityId) : undefined,
          ),
        )
        .orderBy(desc(salesDocuments.documentDate), desc(salesDocuments.createdAt));

      return rows.map((r) => ({
        ...r,
        marginPercent:
          r.unitCostAtSale != null && Number(r.unitGrossPrice) > 0
            ? ((Number(r.unitGrossPrice) - Number(r.unitCostAtSale)) / Number(r.unitGrossPrice)) * 100
            : null,
      }));
    },
  );
};
