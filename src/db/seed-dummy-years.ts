import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "./client.js";
import { carModels } from "./schema/car-models.js";

/**
 * Dummy Year From / Year To values for a handful of existing `car_models`
 * rows, purely so Mehmoon can click through the real Make > Model > Year >
 * Variant search cascade (`PosView.tsx`) himself with plausible data,
 * instead of every seeded row showing "Year not specified." Not client-
 * confirmed vehicle data — fabricated year ranges would misrepresent the
 * client's real fitment records, so this stays out of `seed.ts` entirely
 * (same reasoning as `seed-car-makes.ts`'s own header comment) and gets
 * its own clearly-labeled, skippable script instead.
 *
 * Two groups, picked for two different things worth exercising:
 * - Suzuki Bolan / Mehran (+ its VX/VXR variants) are the only rows in the
 *   database with a real part actually fitted to them (`CP-10042-L` /
 *   `CP-10042`) — giving them years is what lets a real search actually
 *   return a part, not just resolve the cascade to an empty result.
 *   Mehran's three rows deliberately overlap (bare 1988-2005, VX
 *   2000-2012, VXR 2005-2012) so picking a year in the overlap (e.g. 2006)
 *   surfaces all three in the Variant step, same "more than one row
 *   matches this year" scenario already verified with throwaway test data
 *   when the Variant feature was first built.
 * - Toyota Corolla and Honda Civic's trim-level rows (from
 *   `seed-car-makes.ts`) have no fitment at all, so a search against them
 *   will correctly return zero parts regardless of year picked — these
 *   are for exercising the cascade/disambiguation UI itself, not for
 *   getting a real result back. Civic's ranges deliberately recreate
 *   Mehmoon's own example from when this feature was scoped ("Civic RS
 *   Turbo wasn't available in 2012"): VTi and VTi Oriel cover 2012, RS
 *   Turbo doesn't start until 2016.
 *
 * Matched on (make, model, variant) case-insensitively, same helper
 * pattern as `seed-car-makes.ts`; only ever fills in a row whose
 * yearFrom/yearTo are BOTH still null, so it never overwrites a real
 * year Mehmoon or a client user has since entered by hand. Safe to
 * re-run — a second run updates nothing.
 */
const DUMMY_YEARS: {
  make: string;
  model: string;
  variant: string | null;
  yearFrom: number;
  yearTo: number;
}[] = [
  { make: "Suzuki", model: "Bolan", variant: null, yearFrom: 2005, yearTo: 2018 },
  { make: "Suzuki", model: "Mehran", variant: null, yearFrom: 1988, yearTo: 2005 },
  { make: "Suzuki", model: "Mehran", variant: "VX", yearFrom: 2000, yearTo: 2012 },
  { make: "Suzuki", model: "Mehran", variant: "VXR", yearFrom: 2005, yearTo: 2012 },

  { make: "Toyota", model: "Corolla", variant: "XLI", yearFrom: 2008, yearTo: 2017 },
  { make: "Toyota", model: "Corolla", variant: "GLI", yearFrom: 2008, yearTo: 2017 },
  { make: "Toyota", model: "Corolla", variant: "Altis", yearFrom: 2014, yearTo: 2020 },
  { make: "Toyota", model: "Corolla", variant: "Grande", yearFrom: 2016, yearTo: 2020 },

  { make: "Honda", model: "Civic", variant: "VTi", yearFrom: 2006, yearTo: 2012 },
  { make: "Honda", model: "Civic", variant: "VTi Oriel", yearFrom: 2006, yearTo: 2016 },
  { make: "Honda", model: "Civic", variant: "RS Turbo", yearFrom: 2016, yearTo: 2017 },
];

async function main() {
  let updated = 0;
  let notFound = 0;
  let skippedAlreadySet = 0;

  for (const row of DUMMY_YEARS) {
    const variantMatch =
      row.variant === null
        ? isNull(carModels.variant)
        : sql`lower(${carModels.variant}) = lower(${row.variant})`;

    const [existing] = await db
      .select({ id: carModels.id, yearFrom: carModels.yearFrom, yearTo: carModels.yearTo })
      .from(carModels)
      .where(
        and(
          sql`lower(${carModels.make}) = lower(${row.make})`,
          sql`lower(${carModels.model}) = lower(${row.model})`,
          variantMatch,
        ),
      );

    if (!existing) {
      console.log(`  [not found] ${row.make} ${row.model}${row.variant ? ` ${row.variant}` : ""}`);
      notFound++;
      continue;
    }

    if (existing.yearFrom !== null || existing.yearTo !== null) {
      console.log(
        `  [already has years, skipped] ${row.make} ${row.model}${row.variant ? ` ${row.variant}` : ""} (${existing.yearFrom}-${existing.yearTo})`,
      );
      skippedAlreadySet++;
      continue;
    }

    await db
      .update(carModels)
      .set({ yearFrom: row.yearFrom, yearTo: row.yearTo })
      .where(eq(carModels.id, existing.id));
    console.log(`  [updated] ${row.make} ${row.model}${row.variant ? ` ${row.variant}` : ""} -> ${row.yearFrom}-${row.yearTo}`);
    updated++;
  }

  console.log(`\nDone. ${updated} updated, ${skippedAlreadySet} already had years, ${notFound} not found.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
