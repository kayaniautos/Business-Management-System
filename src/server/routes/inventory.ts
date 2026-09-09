import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
  markers,
  items,
  controlParts,
  carModels,
  partCarModels,
} from "../../db/schema/index.js";

/**
 * First real CRUD for the three-step inventory structure (CLAUDE.md 5.2/
 * 5.3): markers -> items -> control_parts, plus car-model fitment.
 *
 * Builds against the schema exactly as it already exists — does NOT
 * attempt to resolve the still-open [unclear — confirm] question of
 * whether a Control Part should attach to multiple Items (per the
 * client's actual notes) rather than the one-item-per-control-part FK
 * this schema currently has. That's a schema decision needing client
 * input, not something to quietly redesign while building a CRUD screen.
 */
export const inventoryRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // --- Markers ---
  app.get("/markers", async () => db.query.markers.findMany({ orderBy: (m, { asc }) => asc(m.name) }));

  app.post(
    "/markers",
    { schema: { body: z.object({ name: z.string().min(1).max(200), description: z.string().max(2000).optional() }) } },
    async (request) => {
      const [row] = await db.insert(markers).values(request.body).returning();
      return row;
    },
  );

  // --- Items ---
  app.get(
    "/items",
    { schema: { querystring: z.object({ markerId: z.string().uuid().optional() }) } },
    async (request) => {
      const { markerId } = request.query;
      return db.query.items.findMany({
        where: markerId ? eq(items.markerId, markerId) : undefined,
        orderBy: (i, { asc }) => asc(i.name),
      });
    },
  );

  app.post(
    "/items",
    {
      schema: {
        body: z.object({
          name: z.string().min(1).max(200),
          description: z.string().max(2000).optional(),
          markerId: z.string().uuid(),
        }),
      },
    },
    async (request) => {
      const [row] = await db.insert(items).values(request.body).returning();
      return row;
    },
  );

  // --- Control parts ---
  const controlPartResponseSchema = z.object({
    id: z.string(),
    partNumber: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    itemId: z.string().nullable(),
    parentControlPartId: z.string().nullable(),
    parentPartNumber: z.string().nullable(),
    fitment: z.array(z.object({ id: z.string(), make: z.string(), model: z.string() })),
  });

  app.get(
    "/control-parts",
    {
      schema: {
        querystring: z.object({ itemId: z.string().uuid().optional() }),
        response: { 200: z.array(controlPartResponseSchema) },
      },
    },
    async (request) => {
      const { itemId } = request.query;
      const rows = await db.query.controlParts.findMany({
        where: itemId ? eq(controlParts.itemId, itemId) : undefined,
        orderBy: (c, { asc }) => asc(c.partNumber),
      });
      if (rows.length === 0) return [];

      const parentIds = [...new Set(rows.map((r) => r.parentControlPartId).filter((id): id is string => !!id))];
      const parents = parentIds.length
        ? await db.select({ id: controlParts.id, partNumber: controlParts.partNumber }).from(controlParts).where(inArray(controlParts.id, parentIds))
        : [];
      const parentById = new Map(parents.map((p) => [p.id, p.partNumber]));

      const fitmentRows = await db
        .select({ controlPartId: partCarModels.controlPartId, carModelId: carModels.id, make: carModels.make, model: carModels.model })
        .from(partCarModels)
        .innerJoin(carModels, eq(partCarModels.carModelId, carModels.id))
        .where(inArray(partCarModels.controlPartId, rows.map((r) => r.id)));
      const fitmentByPart = new Map<string, { id: string; make: string; model: string }[]>();
      for (const f of fitmentRows) {
        const list = fitmentByPart.get(f.controlPartId) ?? [];
        list.push({ id: f.carModelId, make: f.make, model: f.model });
        fitmentByPart.set(f.controlPartId, list);
      }

      return rows.map((r) => ({
        id: r.id,
        partNumber: r.partNumber,
        name: r.name,
        description: r.description,
        itemId: r.itemId,
        parentControlPartId: r.parentControlPartId,
        parentPartNumber: r.parentControlPartId ? (parentById.get(r.parentControlPartId) ?? null) : null,
        fitment: fitmentByPart.get(r.id) ?? [],
      }));
    },
  );

  app.post(
    "/control-parts",
    {
      schema: {
        body: z.object({
          partNumber: z.string().min(1).max(100),
          name: z.string().min(1).max(200),
          description: z.string().max(2000).optional(),
          itemId: z.string().uuid(),
          parentControlPartId: z.string().uuid().optional(),
        }),
      },
    },
    async (request) => {
      const [row] = await db.insert(controlParts).values(request.body).returning();
      return row;
    },
  );

  // --- Car models (for fitment) ---
  app.get("/car-models", async () => db.query.carModels.findMany({ orderBy: (c, { asc }) => asc(c.make) }));

  app.post(
    "/car-models",
    {
      schema: {
        body: z.object({
          make: z.string().min(1).max(100),
          model: z.string().min(1).max(100),
          yearFrom: z.number().int().optional(),
          yearTo: z.number().int().optional(),
        }),
      },
    },
    async (request) => {
      const [row] = await db.insert(carModels).values(request.body).returning();
      return row;
    },
  );

  app.post(
    "/control-parts/:controlPartId/fitment",
    {
      schema: {
        params: z.object({ controlPartId: z.string().uuid() }),
        body: z.object({ carModelId: z.string().uuid() }),
      },
    },
    async (request, reply) => {
      const { controlPartId } = request.params;
      const { carModelId } = request.body;
      await db
        .insert(partCarModels)
        .values({ controlPartId, carModelId })
        .onConflictDoNothing({ target: [partCarModels.controlPartId, partCarModels.carModelId] });
      return reply.code(204).send();
    },
  );

  app.delete(
    "/control-parts/:controlPartId/fitment/:carModelId",
    { schema: { params: z.object({ controlPartId: z.string().uuid(), carModelId: z.string().uuid() }) } },
    async (request, reply) => {
      const { controlPartId, carModelId } = request.params;
      await db
        .delete(partCarModels)
        .where(and(eq(partCarModels.controlPartId, controlPartId), eq(partCarModels.carModelId, carModelId)));
      return reply.code(204).send();
    },
  );
};
