import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { roles } from "../../db/schema/index.js";
import { db } from "../../db/client.js";

const errorResponseSchema = z.object({ error: z.string() });

const roleResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isSystem: z.boolean(),
});

/**
 * Role management — CLAUDE.md 5.8: "the admin must be able to create
 * arbitrary roles at runtime," confirmed 2026-09-10 alongside the
 * five-role starting list. This is deliberately ONLY roles (create/list)
 * — it does NOT touch `permissions`/`role_permissions` (what a role can
 * actually do). That catalog is intentionally unseeded (see
 * src/db/schema/users.ts's own comment) and CLAUDE.md 5.8 is explicit:
 * "do not extend this scaffold toward approval-limit/authority logic
 * until the scoping conversation... is finished." Building a
 * permissions-grant UI now would mean inventing permission keys nobody
 * has confirmed.
 */
export const rolesRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    "/",
    { schema: { response: { 200: z.array(roleResponseSchema) } } },
    async () => {
      return db.query.roles.findMany({ orderBy: (r, { asc }) => asc(r.name) });
    },
  );

  app.post(
    "/",
    {
      schema: {
        body: z.object({
          name: z.string().trim().min(1).max(100),
          description: z.string().max(500).optional(),
        }),
        response: { 200: roleResponseSchema, 400: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const { name, description } = request.body;

      const existing = await db.query.roles.findFirst({ where: (r, { eq }) => eq(r.name, name) });
      if (existing) return reply.code(400).send({ error: "A role with this name already exists" });

      // Admin-created roles are never isSystem — that flag is reserved
      // for the five roles seeded at setup (src/db/seed.ts).
      const [role] = await db.insert(roles).values({ name, description, isSystem: false }).returning();
      return role;
    },
  );
};
