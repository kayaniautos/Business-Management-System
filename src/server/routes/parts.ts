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
} from "../../db/schema/index.js";

const searchQuerySchema = z.object({
  q: z.string().trim().min(1),
});

const searchResultSchema = z.array(
  z.object({
    id: z.string(),
    partNumber: z.string(),
    name: z.string(),
    itemName: z.string().nullable(),
    markerName: z.string().nullable(),
    fitment: z.array(z.object({ make: z.string(), model: z.string() })),
  }),
);

/**
 * Real search against seeded catalog data — no stock/quantity field
 * exists yet (no inventory ledger has been built, see CLAUDE.md section 9
 * "no ledger... tables yet"), so this deliberately doesn't invent one.
 * The earlier UI concept showed fake stock numbers; this endpoint only
 * returns fields that actually exist in the schema.
 */
export const partsRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    "/search",
    { schema: { querystring: searchQuerySchema, response: { 200: searchResultSchema } } },
    async (request) => {
      const { q } = request.query;
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

      if (matches.length === 0) return [];

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

      const fitmentByPartId = new Map<string, { make: string; model: string }[]>();
      for (const row of fitmentRows) {
        const list = fitmentByPartId.get(row.controlPartId) ?? [];
        list.push({ make: row.make, model: row.model });
        fitmentByPartId.set(row.controlPartId, list);
      }

      return matches.map((m) => ({
        ...m,
        fitment: fitmentByPartId.get(m.id) ?? [],
      }));
    },
  );
};
