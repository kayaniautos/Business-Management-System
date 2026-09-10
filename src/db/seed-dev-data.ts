import bcrypt from "bcryptjs";
import { db } from "./client.js";
import { users, userRoles } from "./schema/users.js";
import { markers, items, controlParts } from "./schema/inventory.js";
import { carModels, partCarModels } from "./schema/car-models.js";

/**
 * Local-dev-only sample data for the vertical slice (real login, real
 * parts search) — NOT confirmed business data like seed.ts. A fake staff
 * account and a couple of catalog rows so there's something real to log in
 * with and search for. Never run this against anything but a local dev
 * database.
 *
 * Safe to re-run: rows with a real unique constraint use
 * onConflictDoNothing; markers/items/car_models (no unique constraint on
 * their natural key) check existence before inserting instead.
 */
async function main() {
  const pinHash = await bcrypt.hash("1234", 10);

  const [demoUser] = await db
    .insert(users)
    .values({
      username: "asif.raza",
      fullName: "Asif Raza",
      passwordHash: pinHash,
    })
    .onConflictDoNothing({ target: users.username })
    .returning();

  const demoUserId =
    demoUser?.id ??
    (
      await db.query.users.findFirst({
        where: (u, { eq }) => eq(u.username, "asif.raza"),
      })
    )?.id;

  const counterControlRole = await db.query.roles.findFirst({
    where: (r, { eq }) => eq(r.name, "Counter Control"),
  });

  if (demoUserId && counterControlRole) {
    await db
      .insert(userRoles)
      .values({ userId: demoUserId, roleId: counterControlRole.id })
      .onConflictDoNothing({
        target: [userRoles.userId, userRoles.roleId],
      });
  }

  // Dev-only bootstrap admin (2026-09-10) — NOT Ghaus's real account.
  // Exists purely so the Admin Settings feature is reachable at all
  // without a chicken-and-egg problem (only an admin can grant admin
  // access, so the very first one has to come from somewhere). Real
  // deployment: log in with this account once, then grant Ghaus's real
  // account admin access through the UI and deactivate/repurpose this
  // one — his real email/password were never provided, so they were
  // never invented here.
  const adminPinHash = await bcrypt.hash("0000", 10);
  const adminPasswordHash = await bcrypt.hash("admin1234", 10);
  await db
    .insert(users)
    .values({
      username: "admin.dev",
      fullName: "Dev Admin (bootstrap only)",
      passwordHash: adminPinHash,
      adminIdentifier: "admin@kayaniautos.local",
      adminPasswordHash,
      isAdmin: true,
    })
    .onConflictDoNothing({ target: users.username });

  // markers.name and items.name have no unique constraint (see
  // inventory.ts) — check-then-insert here rather than onConflictDoNothing,
  // which needs a real unique/exclusion constraint to target.
  let engineMarkerId = (
    await db.query.markers.findFirst({
      where: (m, { eq }) => eq(m.name, "Engine Parts"),
    })
  )?.id;
  if (!engineMarkerId) {
    const [engineParts] = await db
      .insert(markers)
      .values({ name: "Engine Parts" })
      .returning();
    engineMarkerId = engineParts?.id;
  }

  let oilFiltersItemId = (
    await db.query.items.findFirst({
      where: (i, { eq }) => eq(i.name, "Oil Filters"),
    })
  )?.id;
  if (!oilFiltersItemId) {
    const [oilFilters] = await db
      .insert(items)
      .values({ name: "Oil Filters", markerId: engineMarkerId })
      .returning();
    oilFiltersItemId = oilFilters?.id;
  }

  await db
    .insert(controlParts)
    .values([
      {
        itemId: oilFiltersItemId,
        partNumber: "CP-10042",
        name: "Oil Filter - Standard",
      },
      {
        itemId: oilFiltersItemId,
        partNumber: "CP-10043",
        name: "Oil Filter - Heavy Duty",
      },
    ])
    .onConflictDoNothing({ target: controlParts.partNumber });

  // car_models has no unique constraint on (make, model), so this checks
  // existence before inserting rather than relying on onConflictDoNothing
  // (which needs a real unique/exclusion constraint to target).
  let mehranId = (
    await db.query.carModels.findFirst({
      where: (c, { and, eq }) =>
        and(eq(c.make, "Suzuki"), eq(c.model, "Mehran")),
    })
  )?.id;

  if (!mehranId) {
    const [mehran] = await db
      .insert(carModels)
      .values({ make: "Suzuki", model: "Mehran" })
      .returning();
    mehranId = mehran?.id;
  }

  const standardFilter = await db.query.controlParts.findFirst({
    where: (c, { eq }) => eq(c.partNumber, "CP-10042"),
  });

  if (mehranId && standardFilter) {
    await db
      .insert(partCarModels)
      .values({ controlPartId: standardFilter.id, carModelId: mehranId })
      .onConflictDoNothing({
        target: [partCarModels.controlPartId, partCarModels.carModelId],
      });
  }

  console.log("Dev sample data seeded. Login: asif.raza / PIN 1234");
  console.log("Dev admin bootstrap: admin.dev via Admin Login, admin@kayaniautos.local / admin1234");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
