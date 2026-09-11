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
 * starter set; this is Mehmoon's own judgment call, not a client ask.
 *
 * Idempotent: only inserts a (make, model) pair that isn't already on
 * file, case-insensitively — safe to re-run, and won't fight with
 * whatever staff have already entered for real by the time this runs.
 */
const STARTER_CAR_MODELS: { make: string; model: string }[] = [
  { make: "Suzuki", model: "Mehran" },
  { make: "Suzuki", model: "Bolan" },
  { make: "Suzuki", model: "Alto" },
  { make: "Suzuki", model: "Cultus" },
  { make: "Suzuki", model: "Wagon R" },
  { make: "Suzuki", model: "Swift" },
  { make: "Suzuki", model: "Ravi" },
  { make: "Toyota", model: "Corolla" },
  { make: "Toyota", model: "Vitz" },
  { make: "Toyota", model: "Prius" },
  { make: "Toyota", model: "Hiace" },
  { make: "Toyota", model: "Hilux" },
  { make: "Toyota", model: "Fortuner" },
  { make: "Toyota", model: "Yaris" },
  { make: "Honda", model: "City" },
  { make: "Honda", model: "Civic" },
  { make: "Honda", model: "BR-V" },
  { make: "Daihatsu", model: "Mira" },
  { make: "Daihatsu", model: "Cuore" },
  { make: "Hyundai", model: "Tucson" },
  { make: "Hyundai", model: "Elantra" },
  { make: "Hyundai", model: "Sonata" },
  { make: "KIA", model: "Sportage" },
  { make: "KIA", model: "Picanto" },
  { make: "KIA", model: "Sorento" },
  { make: "Changan", model: "Alsvin" },
  { make: "MG", model: "HS" },
  { make: "MG", model: "ZS" },
  { make: "Nissan", model: "Dayz" },
  { make: "Nissan", model: "Note" },
];

async function main() {
  const existing = await db.select({ make: carModels.make, model: carModels.model }).from(carModels);
  const existingKeys = new Set(existing.map((r) => `${r.make.toLowerCase()}|${r.model.toLowerCase()}`));

  const toInsert = STARTER_CAR_MODELS.filter(
    (c) => !existingKeys.has(`${c.make.toLowerCase()}|${c.model.toLowerCase()}`),
  );

  if (toInsert.length === 0) {
    console.log("All starter car models already on file, nothing to add.");
    return;
  }

  await db.insert(carModels).values(toInsert);
  console.log(`Added ${toInsert.length} starter car model(s): ${toInsert.map((c) => `${c.make} ${c.model}`).join(", ")}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
