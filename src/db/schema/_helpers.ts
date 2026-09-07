import { timestamp, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";

/**
 * Standard primary key for every table.
 * UUIDv7 (not v4, not serial) per DECISIONS.md: client-generated on offline
 * terminals with no central authority, and time-ordered so the local Postgres
 * write path doesn't get the index fragmentation random v4 UUIDs cause.
 * Generated in the application, not via a Postgres default, so it works the
 * same regardless of the server's Postgres version.
 */
export const idColumn = {
  id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
};

/**
 * created_at / updated_at on every table, per team decision (2026-09-07):
 * cheap to add now, painful to backfill later.
 * created_by / updated_by are added per-table (not here) because they FK to
 * users.id, and _helpers.ts must not import schema/users.ts (circular import).
 */
export const timestampColumns = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};
