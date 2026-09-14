import { eq } from "drizzle-orm";
import { db } from "./client.js";
import { roles, roleModules } from "./schema/index.js";
import { MODULE_KEYS } from "../server/module-keys.js";

/**
 * One-time backfill for the new role-based module access control
 * (Mehmoon's request, 2026-09-14): every role that predates this feature
 * gets ALL module keys granted by default, so turning this feature on
 * doesn't silently lock any existing staff out of screens they could
 * already reach — CLAUDE.md 5.8's own note that the client wants this
 * "fully admin-editable" with no default matrix given means "everyone
 * keeps today's access until an admin deliberately narrows it down" is
 * the only safe starting point, not a guessed-at per-role matrix.
 *
 * Idempotent by construction, not by re-running the same inserts: only
 * touches a role that currently has ZERO `role_modules` rows, so an
 * admin's real narrowing of a role's access (even down to zero modules,
 * a deliberate "no access" choice) is never silently reverted by a later
 * run of this script.
 */
async function main() {
  const allRoles = await db.query.roles.findMany();
  let seeded = 0;
  let skipped = 0;

  for (const role of allRoles) {
    const existing = await db.query.roleModules.findFirst({ where: eq(roleModules.roleId, role.id) });
    if (existing) {
      console.log(`  [already configured, skipped] ${role.name}`);
      skipped++;
      continue;
    }
    await db.insert(roleModules).values(MODULE_KEYS.map((moduleKey) => ({ roleId: role.id, moduleKey })));
    console.log(`  [granted all modules] ${role.name}`);
    seeded++;
  }

  console.log(`\nDone. ${seeded} role(s) seeded with full module access, ${skipped} already configured.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
