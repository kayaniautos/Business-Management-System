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

export const carModels = pgTable("car_models", {
  ...idColumn,
  make: varchar("make", { length: 100 }).notNull(),
  model: varchar("model", { length: 100 }).notNull(),
  // Nullable: not every part fitment is year-specific.
  yearFrom: integer("year_from"),
  yearTo: integer("year_to"),
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
