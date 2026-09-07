import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { idColumn, timestampColumns } from "./_helpers.js";
import { users } from "./users.js";
import { legalEntities } from "./entities.js";

/**
 * First pass at FBR (SRO 288/2026) offline invoice queuing, per CLAUDE.md
 * 2.2: invoices queue here when created offline, and a retry worker pushes
 * them to FBR once connectivity returns.
 *
 * There is no `invoices` table yet (POS/sales isn't built in this pass), so
 * `localInvoiceId` is a plain uuid, not an FK, until that table exists.
 * `payload` carries whatever the FBR submission needs in the meantime.
 */
export const fbrQueueStatusEnum = pgEnum("fbr_queue_status", [
  "pending",
  "submitted",
  "acknowledged",
  "failed",
]);

export const fbrQueue = pgTable("fbr_queue", {
  ...idColumn,
  legalEntityId: uuid("legal_entity_id")
    .notNull()
    .references(() => legalEntities.id),
  // Not FK-constrained yet — see file comment.
  localInvoiceId: uuid("local_invoice_id").notNull(),
  payload: jsonb("payload").notNull(),
  status: fbrQueueStatusEnum("status").notNull().default("pending"),
  attemptCount: integer("attempt_count").notNull().default(0),
  lastAttemptedAt: timestamp("last_attempted_at", { withTimezone: true }),
  lastError: text("last_error"),
  fbrInvoiceNumber: varchar("fbr_invoice_number", { length: 100 }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  ...timestampColumns,
  createdBy: uuid("created_by").references(() => users.id),
  updatedBy: uuid("updated_by").references(() => users.id),
});
