import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";
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

  // --- Car models (Vehicles screen, plus fitment picking elsewhere) ---
  const carModelBodySchema = z.object({
    make: z.string().min(1).max(100),
    model: z.string().min(1).max(100),
    variant: z.string().max(100).optional(),
    frameEngineName: z.string().max(100).optional(),
    yearFrom: z.number().int().optional(),
    yearTo: z.number().int().optional(),
    engineCapacityCc: z.number().int().positive().optional(),
    transmission: z.string().max(50).optional(),
    engineFuel: z.string().max(50).optional(),
  });

  app.get(
    "/car-models",
    { schema: { querystring: z.object({ q: z.string().optional() }) } },
    async (request) => {
      const { q } = request.query;
      return db.query.carModels.findMany({
        where: q
          ? (c, { or: orOp, ilike: ilikeOp }) =>
              orOp(ilikeOp(c.make, `%${q}%`), ilikeOp(c.model, `%${q}%`), ilikeOp(c.variant, `%${q}%`))
          : undefined,
        orderBy: (c, { asc }) => [asc(c.make), asc(c.model)],
      });
    },
  );

  /**
   * Blue-collar counter staff typing make/model by hand will genuinely
   * spell "Suzuki" as "Sazuki" or "Corolla" as "Carolla" (Mehmoon's own
   * example, 2026-09-11) — left unchecked, that fragments search and
   * fitment across near-duplicate car models. This doesn't try to catch
   * an outright misspelling (that's the frontend autocomplete's job —
   * CarModelsView.tsx/InventoryView.tsx suggest from what's already on
   * file as they type); it only catches the narrower, very common case
   * of the SAME word typed in different casing ("suzuki" vs "Suzuki"),
   * silently reusing whatever casing is already on file instead of
   * creating a near-duplicate that differs only by case.
   */
  async function canonicalizeMakeModel(input: { make: string; model: string }, excludeId?: string) {
    const [existingMake] = await db
      .select({ make: carModels.make })
      .from(carModels)
      .where(
        and(
          sql`lower(${carModels.make}) = lower(${input.make})`,
          excludeId ? sql`${carModels.id} != ${excludeId}` : undefined,
        ),
      )
      .limit(1);
    const [existingModel] = await db
      .select({ model: carModels.model })
      .from(carModels)
      .where(
        and(
          sql`lower(${carModels.model}) = lower(${input.model})`,
          excludeId ? sql`${carModels.id} != ${excludeId}` : undefined,
        ),
      )
      .limit(1);
    return {
      make: existingMake?.make ?? input.make,
      model: existingModel?.model ?? input.model,
    };
  }

  app.post(
    "/car-models",
    { schema: { body: carModelBodySchema } },
    async (request) => {
      const canonical = await canonicalizeMakeModel(request.body);
      const [row] = await db.insert(carModels).values({ ...request.body, ...canonical }).returning();
      return row;
    },
  );

  app.put(
    "/car-models/:id",
    { schema: { params: z.object({ id: z.string().uuid() }), body: carModelBodySchema } },
    async (request, reply) => {
      // excludeId: without this, editing a row to FIX its own casing
      // ("honda" -> "Honda") would match its own still-unwritten old
      // casing and silently revert the correction — a real bug, caught
      // while testing this feature.
      const canonical = await canonicalizeMakeModel(request.body, request.params.id);
      const [row] = await db
        .update(carModels)
        .set({ ...request.body, ...canonical })
        .where(eq(carModels.id, request.params.id))
        .returning();
      if (!row) return reply.code(404).send({ error: "Car model not found" });
      return row;
    },
  );

  app.delete(
    "/car-models/:id",
    { schema: { params: z.object({ id: z.string().uuid() }) } },
    async (request, reply) => {
      // part_car_models.carModelId is ON DELETE CASCADE, so removing a car
      // model also removes any fitment links to it — the frontend warns
      // about this before calling delete, since it's otherwise silent.
      await db.delete(carModels).where(eq(carModels.id, request.params.id));
      return reply.code(204).send();
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
