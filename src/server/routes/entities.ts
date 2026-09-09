import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { db } from "../../db/client.js";

const entityListResponseSchema = z.array(
  z.object({ id: z.string(), name: z.string() }),
);

export const entitiesRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    "/",
    { schema: { response: { 200: entityListResponseSchema } } },
    async () => {
      const rows = await db.query.legalEntities.findMany();
      return rows.map((r) => ({ id: r.id, name: r.name }));
    },
  );
};
