import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { roles, roleModules } from "../../db/schema/index.js";
import { db } from "../../db/client.js";
import { MODULE_KEYS } from "../module-keys.js";

const errorResponseSchema = z.object({ error: z.string() });

const roleResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isSystem: z.boolean(),
  moduleKeys: z.array(z.string()),
});

async function moduleKeysForRole(roleId: string): Promise<string[]> {
  const rows = await db.select({ moduleKey: roleModules.moduleKey }).from(roleModules).where(eq(roleModules.roleId, roleId));
  return rows.map((r) => r.moduleKey);
}

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
      const allRoles = await db.query.roles.findMany({ orderBy: (r, { asc }) => asc(r.name) });
      return Promise.all(allRoles.map(async (r) => ({ ...r, moduleKeys: await moduleKeysForRole(r.id) })));
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
      // for the five roles seeded at setup (src/db/seed.ts). A brand new
      // role starts with zero module access — deliberately NOT the
      // "default to everything" backfill used for pre-existing roles
      // (seed-role-modules.ts): those got that treatment only to avoid
      // silently locking out real staff who already had access; a role
      // an admin is creating fresh has no existing users to protect.
      const [role] = await db.insert(roles).values({ name, description, isSystem: false }).returning();
      return { ...role, moduleKeys: [] };
    },
  );

  /**
   * Sets a role's nav-module access to EXACTLY the given list (replace-
   * all, same "delete then re-insert" pattern PUT /:id/roles on
   * admin-users.ts already uses for a user's role set). `[]` is a valid,
   * deliberate choice — a role with no modules granted sees nothing
   * except what `isAdmin` bypasses.
   */
  app.put(
    "/:id/modules",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.object({ moduleKeys: z.array(z.enum(MODULE_KEYS)) }),
        response: { 200: roleResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { moduleKeys } = request.body;

      const role = await db.query.roles.findFirst({ where: eq(roles.id, id) });
      if (!role) return reply.code(404).send({ error: "Role not found" });

      await db.transaction(async (tx) => {
        await tx.delete(roleModules).where(eq(roleModules.roleId, id));
        if (moduleKeys.length > 0) {
          await tx.insert(roleModules).values(moduleKeys.map((moduleKey) => ({ roleId: id, moduleKey })));
        }
      });

      return { ...role, moduleKeys };
    },
  );
};
