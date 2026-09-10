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

const searchQuerySchema = z
  .object({
    // Optional now (was required) — a pure fitment browse (carModelId
    // only, no typed text) is a real search mode too, not just a filter
    // on top of a text query.
    q: z.string().trim().optional(),
    // Off by default — Quotation/DN search still only returns regular
    // parts, since their line schemas don't accept a Deal Part reference
    // (CLAUDE.md 5.4's checkout-only scoping). Only POS passes this.
    includeDealParts: z.coerce.boolean().optional(),
    // Vehicle fitment search (handover doc §6.2: "by vehicle model +
    // year range... or directly by control part number") — added
    // 2026-09-10, Mehmoon's direction. Narrows to parts fitted to this
    // car_models row; combinable with `q` (both apply together) or used
    // alone to browse everything fitted to a model.
    carModelId: z.string().uuid().optional(),
  })
  .refine((v) => Boolean(v.q) || Boolean(v.carModelId), {
    message: "Provide a search term or a car model",
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
 * picker, just visually distinguishable. Deal Parts have no fitment, so
 * they're never returned for a `carModelId`-only browse.
 *
 * `carModelId` narrows to parts fitted to that `car_models` row. Year
 * disambiguation happens one level up, in the UI (PosView.tsx): the
 * client's own notes (handover doc §6.2) call for fitment search "by
 * vehicle model + year range" — each `car_models` row already IS one
 * model generation with its own year range (e.g. "Corolla 2009-2016"
 * vs. "Corolla 2017-2019" as two separate rows), so picking the right
 * row from a dropdown labeled with its range resolves "which Corolla"
 * without this endpoint needing to parse a year at all.
 */
export const partsRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    "/search",
    {
      schema: {
        querystring: searchQuerySchema,
        response: { 200: searchResultSchema },
      },
    },
    async (request) => {
      const { q, includeDealParts, carModelId } = request.query;

      let fittedPartIds: string[] | null = null;
      if (carModelId) {
        const fittedRows = await db
          .select({ controlPartId: partCarModels.controlPartId })
          .from(partCarModels)
          .where(eq(partCarModels.carModelId, carModelId));
        fittedPartIds = fittedRows.map((r) => r.controlPartId);
        if (fittedPartIds.length === 0) return [];
      }

      const pattern = q ? `%${q}%` : undefined;

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
            pattern ? or(ilike(controlParts.name, pattern), ilike(controlParts.partNumber, pattern)) : undefined,
            fittedPartIds ? inArray(controlParts.id, fittedPartIds) : undefined,
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

      if (!includeDealParts || !pattern) return partResults;

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
