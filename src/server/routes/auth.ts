import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { eq, isNotNull, and } from "drizzle-orm";
import { db } from "../../db/client.js";
import { users, userRoles, roles } from "../../db/schema/index.js";

// Failed-PIN lockout (Mehmoon's direction, 2026-09-10): both numbers are
// inferred defaults, not a client-confirmed policy.
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

const loginBodySchema = z.object({
  username: z.string().min(1),
  // The PIN pad in the UI concept is numeric, but kept as a string here —
  // bcrypt compares strings, and a leading zero in a PIN must not be lost
  // to number coercion.
  pin: z.string().min(1),
});

const adminLoginBodySchema = z.object({
  // Email or phone number — deliberately not validated as email-shaped.
  // Mehmoon's direction 2026-09-10: staff granted admin access are often
  // blue-collar and won't have an email address.
  identifier: z.string().trim().min(1),
  password: z.string().min(1),
});

const loginResponseSchema = z.object({
  id: z.string(),
  username: z.string(),
  fullName: z.string(),
  roles: z.array(z.string()),
  isAdmin: z.boolean(),
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
 *
 * Admin login (POST /admin-login) is a SEPARATE credential and endpoint,
 * not a variant of the PIN flow — `adminIdentifier` (an email OR a phone
 * number, since blue-collar staff often have no email) + `adminPasswordHash`,
 * gated to `isAdmin = true` rows. Added 2026-09-10, Mehmoon's direction:
 * Ghaus needs full access and the ability to grant admin to other users,
 * via a screen distinct from the staff PIN picker (see AdminLoginView.tsx).
 */
export const authRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // Powers the "who's working?" staff picker on the login screen — no PIN
  // entry is required to see who exists, only to unlock as them. Returns
  // active staff only, and only those with a PIN set — an admin-only
  // account (no counter duties) shouldn't clutter this picker.
  app.get(
    "/staff",
    { schema: { response: { 200: staffListResponseSchema } } },
    async () => {
      const activeUsers = await db.query.users.findMany({
        where: and(eq(users.isActive, true), isNotNull(users.passwordHash)),
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

      if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
        const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
        return reply
          .code(401)
          .send({ error: `Too many wrong PINs. Try again in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}.` });
      }

      const pinMatches = await bcrypt.compare(pin, user.passwordHash);
      if (!pinMatches) {
        const attempts = user.failedLoginAttempts + 1;
        const lockingNow = attempts >= MAX_FAILED_ATTEMPTS;
        await db
          .update(users)
          .set({
            failedLoginAttempts: lockingNow ? 0 : attempts,
            lockedUntil: lockingNow ? new Date(Date.now() + LOCKOUT_MINUTES * 60000) : user.lockedUntil,
          })
          .where(eq(users.id, user.id));

        if (lockingNow) {
          return reply
            .code(401)
            .send({ error: `Too many wrong PINs. Try again in ${LOCKOUT_MINUTES} minutes.` });
        }
        return reply.code(401).send({ error: "Invalid username or PIN" });
      }

      if (user.failedLoginAttempts > 0 || user.lockedUntil) {
        await db.update(users).set({ failedLoginAttempts: 0, lockedUntil: null }).where(eq(users.id, user.id));
      }

      return {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        roles: await rolesForUser(user.id),
        isAdmin: user.isAdmin,
      };
    },
  );

  app.post(
    "/admin-login",
    {
      schema: {
        body: adminLoginBodySchema,
        response: { 200: loginResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const { identifier, password } = request.body;

      const user = await db.query.users.findFirst({ where: eq(users.adminIdentifier, identifier) });

      if (!user || !user.isActive || !user.isAdmin || !user.adminPasswordHash) {
        return reply.code(401).send({ error: "Invalid login or password" });
      }

      const passwordMatches = await bcrypt.compare(password, user.adminPasswordHash);
      if (!passwordMatches) {
        return reply.code(401).send({ error: "Invalid login or password" });
      }

      return {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        roles: await rolesForUser(user.id),
        isAdmin: user.isAdmin,
      };
    },
  );
};
