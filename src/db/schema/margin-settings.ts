import { numeric, pgTable, uuid } from "drizzle-orm/pg-core";
import { idColumn, timestampColumns } from "./_helpers.js";
import { users } from "./users.js";

/**
 * Margin alert (CLAUDE.md 5.10): "soft warning (not a hard block) when a
 * line's margin falls outside a configured band." This is that
 * configured band — a single app-wide percentage, not per-category or
 * per-item. `[unclear — confirm]` CLAUDE.md section 11 flags the band's
 * real scope as still open; one global number is the only version the
 * client's own notes actually confirm exists ("a configured band"), and
 * narrowing to per-category/per-item later is an additive change (a new
 * lookup keyed by category/part), not a rewrite of this table.
 *
 * Singleton, enforced at the application layer (services/margin.ts) via
 * upsert-the-only-row rather than a fresh insert each time an admin edits
 * it — the same "no DB-level single-row constraint, Postgres has no clean
 * way to express that without a trigger" reasoning already used elsewhere
 * in this schema. No seed row is required; `getMinimumMarginPercent()`
 * falls back to a plain default (15%) until the first admin edit creates
 * this table's one row.
 */
export const marginSettings = pgTable("margin_settings", {
  ...idColumn,
  minimumMarginPercent: numeric("minimum_margin_percent", { precision: 5, scale: 2 })
    .notNull()
    .default("15"),
  ...timestampColumns,
  updatedBy: uuid("updated_by").references(() => users.id),
});
