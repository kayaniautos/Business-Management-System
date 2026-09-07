import { boolean, pgTable, uuid, varchar } from "drizzle-orm/pg-core";
import { idColumn, timestampColumns } from "./_helpers.js";
import { users } from "./users.js";

/**
 * The two legal entities sharing one physical inventory pool (CLAUDE.md
 * section 1 & 4.4). Per the confirmed design, this table is referenced only
 * where entity separation actually lives structurally: bank accounts,
 * FBR queue submissions, and per-entity document numbering. Everything else
 * (inventory, items, parts) stays entity-agnostic on purpose — do not add an
 * entity_id column to shared-inventory tables.
 */
export const legalEntities = pgTable("legal_entities", {
  ...idColumn,
  name: varchar("name", { length: 150 }).notNull().unique(),
  isGstRegistered: boolean("is_gst_registered").notNull().default(false),
  isFbrIntegrated: boolean("is_fbr_integrated").notNull().default(false),
  ...timestampColumns,
  createdBy: uuid("created_by").references(() => users.id),
  updatedBy: uuid("updated_by").references(() => users.id),
});
