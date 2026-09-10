import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../db/client.js";
import { controlParts, dealParts, dealPartComponents } from "../../db/schema/index.js";

const errorResponseSchema = z.object({ error: z.string() });

const dealPartResponseSchema = z.object({
  id: z.string(),
  printName: z.string(),
  description: z.string().nullable(),
  components: z.array(
    z.object({
      controlPartId: z.string(),
      partNumber: z.string(),
      name: z.string(),
      quantity: z.number(),
    }),
  ),
});

/**
 * Deal Part (Form C, CLAUDE.md 5.4) CRUD. Only the bundle definition
 * lives here — selling one is a normal sales_document_lines row with
 * dealPartId set instead of controlPartId (see sales.ts and
 * sales-document-helpers.ts), priced at the time of sale like any other
 * line, not from anything cached here.
 */
export const dealPartsRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    "/",
    {
      schema: {
        querystring: z.object({ q: z.string().optional() }),
        response: { 200: z.array(dealPartResponseSchema) },
      },
    },
    async (request) => {
      const { q } = request.query;
      const deals = await db.query.dealParts.findMany({
        where: (d, { and: andOp, eq: eqOp, ilike: ilikeOp }) => {
          const conditions = [eqOp(d.isActive, true)];
          if (q) conditions.push(ilikeOp(d.printName, `%${q}%`));
          return andOp(...conditions);
        },
        orderBy: (d, { asc }) => asc(d.printName),
      });
      if (deals.length === 0) return [];

      const componentRows = await db
        .select({
          dealPartId: dealPartComponents.dealPartId,
          controlPartId: dealPartComponents.controlPartId,
          quantity: dealPartComponents.quantity,
          partNumber: controlParts.partNumber,
          name: controlParts.name,
        })
        .from(dealPartComponents)
        .innerJoin(controlParts, eq(dealPartComponents.controlPartId, controlParts.id))
        .where(inArray(dealPartComponents.dealPartId, deals.map((d) => d.id)));

      const componentsByDeal = new Map<string, typeof componentRows>();
      for (const row of componentRows) {
        const list = componentsByDeal.get(row.dealPartId) ?? [];
        list.push(row);
        componentsByDeal.set(row.dealPartId, list);
      }

      return deals.map((d) => ({
        id: d.id,
        printName: d.printName,
        description: d.description,
        components: (componentsByDeal.get(d.id) ?? []).map((c) => ({
          controlPartId: c.controlPartId,
          partNumber: c.partNumber,
          name: c.name,
          quantity: c.quantity,
        })),
      }));
    },
  );

  app.post(
    "/",
    {
      schema: {
        body: z.object({
          printName: z.string().trim().min(1).max(200),
          description: z.string().max(2000).optional(),
          // "Two or more Items" (CLAUDE.md 5.4) — enforced here, same
          // place as the party-phone-number 1-5 cap and the discount
          // max-2 cap elsewhere in this codebase.
          components: z
            .array(
              z.object({
                controlPartId: z.string().uuid(),
                quantity: z.number().int().min(1),
              }),
            )
            .min(2, "A Deal Part needs at least two items"),
        }),
        response: { 200: dealPartResponseSchema, 400: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const { printName, description, components } = request.body;

      const partIds = [...new Set(components.map((c) => c.controlPartId))];
      const found = await db
        .select({ id: controlParts.id })
        .from(controlParts)
        .where(inArray(controlParts.id, partIds));
      if (found.length !== partIds.length) {
        return reply.code(400).send({ error: "One or more parts were not found" });
      }

      const created = await db.transaction(async (tx) => {
        const [deal] = await tx.insert(dealParts).values({ printName, description }).returning();
        await tx.insert(dealPartComponents).values(
          components.map((c) => ({
            dealPartId: deal.id,
            controlPartId: c.controlPartId,
            quantity: c.quantity,
          })),
        );
        return deal;
      });

      const partsById = new Map(
        (
          await db
            .select({ id: controlParts.id, partNumber: controlParts.partNumber, name: controlParts.name })
            .from(controlParts)
            .where(inArray(controlParts.id, partIds))
        ).map((p) => [p.id, p]),
      );

      return {
        id: created.id,
        printName: created.printName,
        description: created.description,
        components: components.map((c) => ({
          controlPartId: c.controlPartId,
          partNumber: partsById.get(c.controlPartId)!.partNumber,
          name: partsById.get(c.controlPartId)!.name,
          quantity: c.quantity,
        })),
      };
    },
  );
};
