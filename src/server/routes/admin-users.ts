import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../db/client.js";
import { users, userRoles, roles } from "../../db/schema/index.js";

const errorResponseSchema = z.object({ error: z.string() });

const roleRefSchema = z.object({ id: z.string(), name: z.string() });

const adminUserResponseSchema = z.object({
  id: z.string(),
  username: z.string(),
  fullName: z.string(),
  phone: z.string().nullable(),
  isActive: z.boolean(),
  // Email or phone number, used as the admin login identifier — see
  // src/db/schema/users.ts's comment on why this isn't email-only.
  adminIdentifier: z.string().nullable(),
  isAdmin: z.boolean(),
  roles: z.array(roleRefSchema),
});

async function rolesForUser(userId: string) {
  const rows = await db
    .select({ id: roles.id, name: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, userId));
  return rows;
}

async function toAdminUser(user: typeof users.$inferSelect) {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    phone: user.phone,
    isActive: user.isActive,
    adminIdentifier: user.adminIdentifier,
    isAdmin: user.isAdmin,
    roles: await rolesForUser(user.id),
  };
}

/**
 * Staff account management for Admin Settings. Distinct from the
 * `/api/auth/staff` endpoint (auth.ts), which is the public "who's
 * working the counter" picker on the login screen and only ever returns
 * active users with a PIN set — this one is the admin's full view
 * (active and inactive, admin or not) and is the first place any user
 * can be created outside a seed script.
 *
 * Same as everywhere else in this app so far: no session/auth-token
 * enforcement exists yet (app.ts's own comment), so this isn't gated to
 * an "admin" role today — that's a known, pre-existing limitation, not
 * something new introduced here. The frontend hides the Admin Settings
 * tab unless `isAdmin` is true, but that's UI-only.
 */
export const adminUsersRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    "/",
    { schema: { response: { 200: z.array(adminUserResponseSchema) } } },
    async () => {
      const allUsers = await db.query.users.findMany({ orderBy: (u, { asc }) => asc(u.fullName) });
      return Promise.all(allUsers.map(toAdminUser));
    },
  );

  app.post(
    "/",
    {
      schema: {
        body: z.object({
          username: z.string().trim().min(1).max(100),
          fullName: z.string().trim().min(1).max(200),
          phone: z.string().max(30).optional(),
          // Numeric PIN pad (LoginView.tsx caps entry at 6 digits) — 4-6
          // digits is an inferred, not client-confirmed, minimum; no PIN
          // length/format rule has actually been given.
          pin: z.string().regex(/^\d{4,6}$/, "PIN must be 4 to 6 digits"),
          roleIds: z.array(z.string().uuid()).default([]),
        }),
        response: { 200: adminUserResponseSchema, 400: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const { username, fullName, phone, pin, roleIds } = request.body;

      const existing = await db.query.users.findFirst({ where: eq(users.username, username) });
      if (existing) return reply.code(400).send({ error: "A user with this username already exists" });

      if (roleIds.length > 0) {
        const found = await db.select({ id: roles.id }).from(roles).where(inArray(roles.id, roleIds));
        if (found.length !== new Set(roleIds).size) {
          return reply.code(400).send({ error: "One or more roles were not found" });
        }
      }

      const passwordHash = await bcrypt.hash(pin, 10);

      const created = await db.transaction(async (tx) => {
        const [user] = await tx.insert(users).values({ username, fullName, phone, passwordHash }).returning();
        if (roleIds.length > 0) {
          await tx.insert(userRoles).values(roleIds.map((roleId) => ({ userId: user.id, roleId })));
        }
        return user;
      });

      return toAdminUser(created);
    },
  );

  app.put(
    "/:id/roles",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.object({ roleIds: z.array(z.string().uuid()) }),
        response: { 200: adminUserResponseSchema, 400: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { roleIds } = request.body;

      const user = await db.query.users.findFirst({ where: eq(users.id, id) });
      if (!user) return reply.code(404).send({ error: "User not found" });

      if (roleIds.length > 0) {
        const found = await db.select({ id: roles.id }).from(roles).where(inArray(roles.id, roleIds));
        if (found.length !== new Set(roleIds).size) {
          return reply.code(400).send({ error: "One or more roles were not found" });
        }
      }

      await db.transaction(async (tx) => {
        await tx.delete(userRoles).where(eq(userRoles.userId, id));
        if (roleIds.length > 0) {
          await tx.insert(userRoles).values(roleIds.map((roleId) => ({ userId: id, roleId })));
        }
      });

      return toAdminUser(user);
    },
  );

  app.post(
    "/:id/deactivate",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: adminUserResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const user = await db.query.users.findFirst({ where: eq(users.id, id) });
      if (!user) return reply.code(404).send({ error: "User not found" });
      await db.update(users).set({ isActive: false }).where(eq(users.id, id));
      return toAdminUser({ ...user, isActive: false });
    },
  );

  app.post(
    "/:id/activate",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: adminUserResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const user = await db.query.users.findFirst({ where: eq(users.id, id) });
      if (!user) return reply.code(404).send({ error: "User not found" });
      await db.update(users).set({ isActive: true }).where(eq(users.id, id));
      return toAdminUser({ ...user, isActive: true });
    },
  );

  /**
   * Grants admin access to an EXISTING user — a separate credential
   * (identifier + password, hashed into `adminPasswordHash`) from their
   * PIN, so promoting a staff member to admin doesn't touch their
   * counter login at all. Mehmoon's direction 2026-09-10: Ghaus is admin
   * and can make other users admin too, via a login distinct from the
   * PIN pad — `identifier` accepts either an email or a phone number,
   * since blue-collar staff being promoted often have no email.
   */
  app.post(
    "/:id/grant-admin",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.object({
          identifier: z.string().trim().min(1),
          password: z.string().min(6, "Password must be at least 6 characters"),
        }),
        response: { 200: adminUserResponseSchema, 400: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { identifier, password } = request.body;

      const user = await db.query.users.findFirst({ where: eq(users.id, id) });
      if (!user) return reply.code(404).send({ error: "User not found" });

      const existing = await db.query.users.findFirst({ where: eq(users.adminIdentifier, identifier) });
      if (existing && existing.id !== id) {
        return reply.code(400).send({ error: "A user with this email or phone already exists" });
      }

      const adminPasswordHash = await bcrypt.hash(password, 10);
      await db
        .update(users)
        .set({ adminIdentifier: identifier, adminPasswordHash, isAdmin: true })
        .where(eq(users.id, id));

      return toAdminUser({ ...user, adminIdentifier: identifier, adminPasswordHash, isAdmin: true });
    },
  );

  // Leaves adminIdentifier/adminPasswordHash in place so re-granting
  // doesn't require re-entering credentials — only the isAdmin flag flips.
  app.post(
    "/:id/revoke-admin",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: adminUserResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const user = await db.query.users.findFirst({ where: eq(users.id, id) });
      if (!user) return reply.code(404).send({ error: "User not found" });
      await db.update(users).set({ isAdmin: false }).where(eq(users.id, id));
      return toAdminUser({ ...user, isAdmin: false });
    },
  );
};
