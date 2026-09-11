import { eq, and, isNull, sql } from "drizzle-orm";
import { db } from "./client.js";
import { carModels } from "./schema/car-models.js";

/**
 * Starter data for the Make/Model autocomplete on the Car Models screen
 * and Inventory's fitment picker (Mehmoon's direction, 2026-09-11) — a
 * short list of well-known Pakistani-market makes and their common
 * models, so the very first entry of, say, "Suzuki" or "Corolla" is
 * already spelled correctly for staff to pick from, rather than waiting
 * for whichever spelling a counter clerk happens to type first.
 *
 * Extended the same day to real trim-level entries ("Corolla GLi,"
 * "Civic VTi Oriel" — Mehmoon's own examples) plus transmission and fuel,
 * since a bare "Corolla" with no variant wasn't actually representative
 * of how these cars are bought/sold/described in Pakistan. Only the
 * volume models that genuinely have well-known, widely-recognized trim
 * names get variant-level rows (Suzuki/Toyota/Honda/Daihatsu — the
 * everyday inventory of a Rawalpindi auto parts shop); the newer
 * imported makes (Hyundai/KIA/Changan/MG/Nissan) get transmission/fuel
 * filled in but no invented variant name, since Pakistan's grey-import
 * market for those isn't standardized enough to guess confidently.
 *
 * Deliberately NOT seed.ts: that file's own header comment says it seeds
 * "only what's literally confirmed in CLAUDE.md" (legal entities, chart
 * of accounts, roles) — this list is the opposite of that, a curated,
 * common-sense guess at the Pakistani auto market, not something the
 * client has confirmed or been asked about. Also NOT seed-dev-data.ts:
 * that file is throwaway dev/testing sample data, and this is meant to
 * be genuinely useful in a real deployment, not just local development.
 *
 * Not exhaustive and not authoritative — every row here is a completely
 * ordinary entry in the real Car Models screen (`CarModelsView.tsx`)
 * once seeded, freely editable or deletable there like any other row.
 * `[unclear — confirm]` if the client wants a different or larger
 * starter set, or disagrees with a specific trim/transmission pairing;
 * this is Mehmoon's own judgment call, not a client-confirmed catalog.
 *
 * Idempotent and non-destructive:
 * - A row is matched on (make, model, variant) case-insensitively (a
 *   null variant only matches another null variant) — this is what lets
 *   trim-level rows ("Corolla GLi") sit alongside a pre-existing bare
 *   "Corolla" row without colliding or needing it deleted (a real
 *   fitment link, e.g. the dev-seeded "Suzuki Mehran," may already point
 *   at a bare row, and this script must never risk that).
 * - If a match already exists, only its NULL transmission/engineFuel
 *   fields get filled in — never overwriting something staff (or an
 *   earlier run) already set to something else. If no match exists, the
 *   full row is inserted.
 * - Safe to re-run any number of times, in any environment, at any point
 *   after real data entry has started.
 */
const STARTER_CAR_MODELS: {
  make: string;
  model: string;
  variant?: string;
  transmission?: string;
  engineFuel?: string;
}[] = [
  // Suzuki
  { make: "Suzuki", model: "Mehran", variant: "VX", transmission: "Manual", engineFuel: "Petrol" },
  { make: "Suzuki", model: "Mehran", variant: "VXR", transmission: "Manual", engineFuel: "Petrol" },
  { make: "Suzuki", model: "Bolan", transmission: "Manual", engineFuel: "Petrol" },
  { make: "Suzuki", model: "Alto", variant: "VXR", transmission: "Manual", engineFuel: "Petrol" },
  { make: "Suzuki", model: "Alto", variant: "VXL", transmission: "Automatic", engineFuel: "Petrol" },
  { make: "Suzuki", model: "Cultus", variant: "VXR", transmission: "Manual", engineFuel: "Petrol" },
  { make: "Suzuki", model: "Cultus", variant: "VXL", transmission: "Manual", engineFuel: "Petrol" },
  { make: "Suzuki", model: "Cultus", variant: "AGS", transmission: "Automatic", engineFuel: "Petrol" },
  { make: "Suzuki", model: "Wagon R", variant: "VXR", transmission: "Manual", engineFuel: "Petrol" },
  { make: "Suzuki", model: "Wagon R", variant: "VXL", transmission: "Manual", engineFuel: "Petrol" },
  { make: "Suzuki", model: "Wagon R", variant: "AGS", transmission: "Automatic", engineFuel: "Petrol" },
  { make: "Suzuki", model: "Swift", variant: "GA", transmission: "Manual", engineFuel: "Petrol" },
  { make: "Suzuki", model: "Swift", variant: "GL", transmission: "Manual", engineFuel: "Petrol" },
  { make: "Suzuki", model: "Swift", variant: "GLX", transmission: "Automatic", engineFuel: "Petrol" },
  { make: "Suzuki", model: "Ravi", transmission: "Manual", engineFuel: "Petrol" },
  // Toyota
  { make: "Toyota", model: "Corolla", variant: "XLI", transmission: "Manual", engineFuel: "Petrol" },
  { make: "Toyota", model: "Corolla", variant: "GLI", transmission: "Automatic", engineFuel: "Petrol" },
  { make: "Toyota", model: "Corolla", variant: "Altis", transmission: "Automatic", engineFuel: "Petrol" },
  { make: "Toyota", model: "Corolla", variant: "Grande", transmission: "Automatic", engineFuel: "Petrol" },
  { make: "Toyota", model: "Vitz", variant: "F", transmission: "Manual", engineFuel: "Petrol" },
  { make: "Toyota", model: "Vitz", variant: "X", transmission: "Automatic", engineFuel: "Petrol" },
  { make: "Toyota", model: "Vitz", variant: "Jewela", transmission: "Automatic", engineFuel: "Petrol" },
  { make: "Toyota", model: "Prius", variant: "S", transmission: "Automatic", engineFuel: "Hybrid" },
  { make: "Toyota", model: "Prius", variant: "G", transmission: "Automatic", engineFuel: "Hybrid" },
  { make: "Toyota", model: "Hiace", transmission: "Manual", engineFuel: "Diesel" },
  { make: "Toyota", model: "Hilux", variant: "Single Cabin", transmission: "Manual", engineFuel: "Diesel" },
  { make: "Toyota", model: "Hilux", variant: "Revo", transmission: "Automatic", engineFuel: "Diesel" },
  { make: "Toyota", model: "Hilux", variant: "Revo V", transmission: "Automatic", engineFuel: "Diesel" },
  { make: "Toyota", model: "Fortuner", variant: "Sigma4", transmission: "Automatic", engineFuel: "Diesel" },
  { make: "Toyota", model: "Fortuner", variant: "Legender", transmission: "Automatic", engineFuel: "Diesel" },
  { make: "Toyota", model: "Yaris", variant: "GLi", transmission: "Manual", engineFuel: "Petrol" },
  { make: "Toyota", model: "Yaris", variant: "ATIV X", transmission: "Automatic", engineFuel: "Petrol" },
  // Honda
  { make: "Honda", model: "City", variant: "Aspire", transmission: "Manual", engineFuel: "Petrol" },
  { make: "Honda", model: "City", variant: "i-VTEC", transmission: "Automatic", engineFuel: "Petrol" },
  { make: "Honda", model: "Civic", variant: "VTi", transmission: "Manual", engineFuel: "Petrol" },
  { make: "Honda", model: "Civic", variant: "VTi Oriel", transmission: "Automatic", engineFuel: "Petrol" },
  { make: "Honda", model: "Civic", variant: "RS Turbo", transmission: "Automatic", engineFuel: "Petrol" },
  { make: "Honda", model: "BR-V", variant: "i-VTEC", transmission: "Automatic", engineFuel: "Petrol" },
  { make: "Honda", model: "BR-V", variant: "S", transmission: "Automatic", engineFuel: "Petrol" },
  // Daihatsu
  { make: "Daihatsu", model: "Mira", variant: "X", transmission: "Automatic", engineFuel: "Petrol" },
  { make: "Daihatsu", model: "Mira", variant: "Custom", transmission: "Automatic", engineFuel: "Petrol" },
  { make: "Daihatsu", model: "Cuore", variant: "CX Eco", transmission: "Manual", engineFuel: "Petrol" },
  // Newer imports — transmission/fuel filled in, no invented variant name
  { make: "Hyundai", model: "Tucson", transmission: "Automatic", engineFuel: "Petrol" },
  { make: "Hyundai", model: "Elantra", transmission: "Automatic", engineFuel: "Petrol" },
  { make: "Hyundai", model: "Sonata", transmission: "Automatic", engineFuel: "Petrol" },
  { make: "KIA", model: "Sportage", transmission: "Automatic", engineFuel: "Petrol" },
  { make: "KIA", model: "Picanto", transmission: "Automatic", engineFuel: "Petrol" },
  { make: "KIA", model: "Sorento", transmission: "Automatic", engineFuel: "Petrol" },
  { make: "Changan", model: "Alsvin", transmission: "Automatic", engineFuel: "Petrol" },
  { make: "MG", model: "HS", transmission: "Automatic", engineFuel: "Petrol" },
  { make: "MG", model: "ZS", transmission: "Automatic", engineFuel: "Petrol" },
  { make: "Nissan", model: "Dayz", transmission: "Automatic", engineFuel: "Petrol" },
  { make: "Nissan", model: "Note", transmission: "Automatic", engineFuel: "Petrol" },
];

async function main() {
  let inserted = 0;
  let filled = 0;

  for (const c of STARTER_CAR_MODELS) {
    const variantMatch = c.variant
      ? sql`lower(${carModels.variant}) = lower(${c.variant})`
      : isNull(carModels.variant);

    const [existing] = await db
      .select({ id: carModels.id, transmission: carModels.transmission, engineFuel: carModels.engineFuel })
      .from(carModels)
      .where(
        and(
          sql`lower(${carModels.make}) = lower(${c.make})`,
          sql`lower(${carModels.model}) = lower(${c.model})`,
          variantMatch,
        ),
      )
      .limit(1);

    if (!existing) {
      await db.insert(carModels).values(c);
      inserted++;
      continue;
    }

    const patch: { transmission?: string; engineFuel?: string } = {};
    if (existing.transmission === null && c.transmission) patch.transmission = c.transmission;
    if (existing.engineFuel === null && c.engineFuel) patch.engineFuel = c.engineFuel;
    if (Object.keys(patch).length > 0) {
      await db.update(carModels).set(patch).where(eq(carModels.id, existing.id));
      filled++;
    }
  }

  console.log(`Car makes seed: ${inserted} row(s) inserted, ${filled} existing row(s) had a missing field filled in.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
