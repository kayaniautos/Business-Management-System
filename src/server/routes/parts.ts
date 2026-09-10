import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { and, eq, ilike, inArray, or } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
  controlParts,
  items,
  markers,
  partCarModels,
  carModels,
  dealParts,
} from "../../db/schema/index.js";

const searchQuerySchema = z.object({
  q: z.string().trim().min(1),
  // Off by default — Quotation/DN search still only returns regular
  // parts, since their line schemas don't accept a Deal Part reference
  // (CLAUDE.md 5.4's checkout-only scoping). Only POS passes this.
  includeDealParts: z.coerce.boolean().optional(),
});

const searchResultSchema = z.array(
  z.object({
    id: z.string(),
    // Null for a Deal Part result — bundles have no part number.
    partNumber: z.string().nullable(),
    name: z.string(),
    itemName: z.string().nullable(),
    markerName: z.string().nullable(),
    fitment: z.array(z.object({ make: z.string(), model: z.string() })),
    isDealPart: z.boolean(),
  }),
);

/**
 * Real search against seeded catalog data — no stock/quantity field
 * exists yet (no inventory ledger has been built, see CLAUDE.md section 9
 * "no ledger... tables yet"), so this deliberately doesn't invent one.
 * The earlier UI concept showed fake stock numbers; this endpoint only
 * returns fields that actually exist in the schema.
 *
 * `includeDealParts` merges matching Deal Parts (CLAUDE.md 5.4) into the
 * same result list, shaped like a regular part with `isDealPart: true`
 * and `partNumber: null` — Mehmoon's direction 2026-09-10: a bundle
 * should show up in search "same like other items," not in a separate
 * picker, just visually distinguishable.
 */
export const partsRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    "/search",
    { schema: { querystring: searchQuerySchema, response: { 200: searchResultSchema } } },
    async (request) => {
      const { q, includeDealParts } = request.query;
      const pattern = `%${q}%`;

      const matches = await db
        .select({
          id: controlParts.id,
          partNumber: controlParts.partNumber,
          name: controlParts.name,
          itemName: items.name,
          markerName: markers.name,
        })
        .from(controlParts)
        .leftJoin(items, eq(controlParts.itemId, items.id))
        .leftJoin(markers, eq(items.markerId, markers.id))
        .where(
          and(
            eq(controlParts.isActive, true),
            or(
              ilike(controlParts.name, pattern),
              ilike(controlParts.partNumber, pattern),
            ),
          ),
        )
        .limit(50);

      let fitmentByPartId = new Map<string, { make: string; model: string }[]>();
      if (matches.length > 0) {
        const fitmentRows = await db
          .select({
            controlPartId: partCarModels.controlPartId,
            make: carModels.make,
            model: carModels.model,
          })
          .from(partCarModels)
          .innerJoin(carModels, eq(partCarModels.carModelId, carModels.id))
          .where(
            inArray(
              partCarModels.controlPartId,
              matches.map((m) => m.id),
            ),
          );

        fitmentByPartId = new Map();
        for (const row of fitmentRows) {
          const list = fitmentByPartId.get(row.controlPartId) ?? [];
          list.push({ make: row.make, model: row.model });
          fitmentByPartId.set(row.controlPartId, list);
        }
      }

      const partResults = matches.map((m) => ({
        ...m,
        fitment: fitmentByPartId.get(m.id) ?? [],
        isDealPart: false,
      }));

      if (!includeDealParts) return partResults;

      const dealMatches = await db
        .select({ id: dealParts.id, name: dealParts.printName })
        .from(dealParts)
        .where(and(eq(dealParts.isActive, true), ilike(dealParts.printName, pattern)))
        .limit(20);

      const dealResults = dealMatches.map((d) => ({
        id: d.id,
        partNumber: null,
        name: d.name,
        itemName: null,
        markerName: null,
        fitment: [],
        isDealPart: true,
      }));

      return [...partResults, ...dealResults];
    },
  );
};
