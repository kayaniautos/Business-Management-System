import {
  integer,
  pgTable,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { idColumn, timestampColumns } from "./_helpers.js";
import { users } from "./users.js";
import { legalEntities } from "./entities.js";

/**
 * Human-facing sequential document numbers (invoice/receipt/etc.), kept
 * separate from the UUIDv7 primary keys per the PK decision (2026-09-07):
 * UUIDs are never printed on documents or sent to FBR; a per-entity
 * sequential number is generated independently.
 *
 * One counter row per (legal entity, document type); `lastNumber` should be
 * incremented inside the same transaction that creates the document, using
 * SELECT ... FOR UPDATE to serialize concurrent writers on one terminal.
 *
 * [unclear — confirm] This scheme assumes a single writer at a time per
 * entity+document type. If two terminals can both be offline and both
 * issuing, say, Kiyan Traders sales invoices at the same time, they will
 * independently increment their own local copy of this counter and collide
 * on the same number once they sync. Needs a decision (e.g. pre-allocated
 * number blocks per terminal, or restricting invoice creation for a given
 * entity to one terminal at a time) before this is relied on for FBR
 * submission. Not resolved here.
 *
 * `documentType` is a free-text code (not an enum) because the full list of
 * document types (sales invoice, delivery challan, receipt/payment voucher,
 * etc.) isn't finalized yet — see CLAUDE.md open questions.
 */
export const documentNumberCounters = pgTable(
  "document_number_counters",
  {
    ...idColumn,
    legalEntityId: uuid("legal_entity_id")
      .notNull()
      .references(() => legalEntities.id),
    documentType: varchar("document_type", { length: 50 }).notNull(),
    lastNumber: integer("last_number").notNull().default(0),
    ...timestampColumns,
    createdBy: uuid("created_by").references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id),
  },
  (table) => [
    uniqueIndex("document_number_counters_entity_type_unique").on(
      table.legalEntityId,
      table.documentType,
    ),
  ],
);
