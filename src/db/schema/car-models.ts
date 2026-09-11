import {
  integer,
  pgTable,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { idColumn, timestampColumns } from "./_helpers.js";
import { users } from "./users.js";
import { controlParts } from "./inventory.js";

/**
 * Gained variant/engine-detail fields 2026-09-11 (Mehmoon's direction:
 * "build the full Car Models screen with variant/engine fields too"),
 * closing the gap CLAUDE.md 5.3 already flagged: the Control Part Form's
 * fitment-line fields ("Model name, Frame/Engine name, Year From, Year
 * To, Engine capacity/CC, Transmission, Engine Fuel") were only ever
 * partially represented here (just make/model/year). `variant` itself
 * (e.g. "GLi", "Altis", "XLi" — a trim level) isn't named in the client's
 * own notes as transcribed in CLAUDE.md, but was explicitly asked for
 * alongside those fields, so it's added as its own column rather than
 * folded into `frameEngineName`. All five new columns are nullable: every
 * existing row predates them, and the client has never confirmed exact
 * value formats for transmission/fuel (free text, not an enum, so a
 * value like "Manual" or "5-Speed Manual" isn't rejected either way —
 * `[unclear — confirm]` if a fixed option list is wanted later).
 */
export const carModels = pgTable("car_models", {
  ...idColumn,
  make: varchar("make", { length: 100 }).notNull(),
  model: varchar("model", { length: 100 }).notNull(),
  variant: varchar("variant", { length: 100 }),
  frameEngineName: varchar("frame_engine_name", { length: 100 }),
  // Nullable: not every part fitment is year-specific.
  yearFrom: integer("year_from"),
  yearTo: integer("year_to"),
  engineCapacityCc: integer("engine_capacity_cc"),
  transmission: varchar("transmission", { length: 50 }),
  engineFuel: varchar("engine_fuel", { length: 50 }),
  ...timestampColumns,
  createdBy: uuid("created_by").references(() => users.id),
  updatedBy: uuid("updated_by").references(() => users.id),
});

/**
 * Parts <-> car models many-to-many (CLAUDE.md 4.3: "one part fits multiple
 * car models ... do not model as one-to-many").
 *
 * [unclear — confirm] Assumes "part" here means control_parts (the Control
 * Part Number level), since that's the level with a concrete part_number.
 * If fitment is actually meant at the item level instead, this FK moves.
 */
export const partCarModels = pgTable(
  "part_car_models",
  {
    ...idColumn,
    controlPartId: uuid("control_part_id")
      .notNull()
      .references(() => controlParts.id, { onDelete: "cascade" }),
    carModelId: uuid("car_model_id")
      .notNull()
      .references(() => carModels.id, { onDelete: "cascade" }),
    ...timestampColumns,
    createdBy: uuid("created_by").references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id),
  },
  (table) => [
    uniqueIndex("part_car_models_part_car_unique").on(
      table.controlPartId,
      table.carModelId,
    ),
  ],
);
