import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { users, userRoles, roles } from "../../db/schema/index.js";

const loginBodySchema = z.object({
  username: z.string().min(1),
  // The PIN pad in the UI concept is numeric, but kept as a string here —
  // bcrypt compares strings, and a leading zero in a PIN must not be lost
  // to number coercion.
  pin: z.string().min(1),
});

const loginResponseSchema = z.object({
  id: z.string(),
  username: z.string(),
  fullName: z.string(),
  roles: z.array(z.string()),
});

const errorResponseSchema = z.object({ error: z.string() });

const staffListResponseSchema = z.array(
  z.object({ id: z.string(), username: z.string(), fullName: z.string(), roles: z.array(z.string()) }),
);

async function rolesForUser(userId: string) {
  const roleRows = await db
    .select({ name: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, userId));
  return roleRows.map((r) => r.name);
}

/**
 * `passwordHash` on `users` (src/db/schema/users.ts) holds a bcrypt hash of
 * the staff member's numeric PIN for this project — the schema was written
 * generically before the PIN-pad login concept existed. Using bcryptjs
 * (pure JS), not the native `bcrypt` package, for the same "no compiled
 * binaries" reason Drizzle was chosen over Prisma (CLAUDE.md section 3).
 */
export const authRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // Powers the "who's working?" staff picker on the login screen — no PIN
  // entry is required to see who exists, only to unlock as them. Returns
  // active staff only.
  app.get(
    "/staff",
    { schema: { response: { 200: staffListResponseSchema } } },
    async () => {
      const activeUsers = await db.query.users.findMany({
        where: (u, { eq }) => eq(u.isActive, true),
      });
      return Promise.all(
        activeUsers.map(async (u) => ({
          id: u.id,
          username: u.username,
          fullName: u.fullName,
          roles: await rolesForUser(u.id),
        })),
      );
    },
  );

  app.post(
    "/login",
    {
      schema: {
        body: loginBodySchema,
        response: { 200: loginResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const { username, pin } = request.body;

      const user = await db.query.users.findFirst({
        where: eq(users.username, username),
      });

      if (!user || !user.isActive) {
        return reply.code(401).send({ error: "Invalid username or PIN" });
      }

      const pinMatches = await bcrypt.compare(pin, user.passwordHash);
      if (!pinMatches) {
        return reply.code(401).send({ error: "Invalid username or PIN" });
      }

      return {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        roles: await rolesForUser(user.id),
      };
    },
  );
};
