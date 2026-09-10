import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { idColumn, timestampColumns } from "./_helpers.js";

/**
 * Basic RBAC scaffold: roles + a permission catalog + role<->permission grants,
 * matching CLAUDE.md 4.1 ("five roles ... admin-editable permissions at runtime
 * ... do not hardcode role logic").
 *
 * [unclear — confirm] This is NOT the "Authority Levels module" flagged in
 * CLAUDE.md section 6 as needing its own requirements conversation before any
 * schema work touches it. We're reading "Authority Levels" as a separate
 * concept (likely approval/spending-limit tiers, e.g. who can approve a
 * discount or refund above some amount) distinct from this basic
 * role/permission access-control scaffold. If it turns out the client means
 * the same thing by "Authority Levels" as this RBAC system, this schema will
 * need revisiting — do not extend this toward approval-limit logic until
 * that conversation happens.
 */

export const roles = pgTable("roles", {
  ...idColumn,
  name: varchar("name", { length: 100 }).notNull().unique(),
  description: text("description"),
  // true for the five confirmed roles seeded at setup; distinguishes them
  // from any custom roles an admin creates later, without hardcoding logic
  // against specific role names.
  isSystem: boolean("is_system").notNull().default(false),
  ...timestampColumns,
  createdBy: uuid("created_by").references((): AnyPgColumn => users.id),
  updatedBy: uuid("updated_by").references((): AnyPgColumn => users.id),
});

/**
 * Catalog of grantable permission keys (e.g. "inventory.item.create").
 * Intentionally left unseeded — the actual set of permission keys isn't
 * defined yet and shouldn't be invented here.
 */
export const permissions = pgTable("permissions", {
  ...idColumn,
  key: varchar("key", { length: 150 }).notNull().unique(),
  description: text("description"),
  ...timestampColumns,
  createdBy: uuid("created_by").references((): AnyPgColumn => users.id),
  updatedBy: uuid("updated_by").references((): AnyPgColumn => users.id),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    ...idColumn,
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
    ...timestampColumns,
    createdBy: uuid("created_by").references((): AnyPgColumn => users.id),
    updatedBy: uuid("updated_by").references((): AnyPgColumn => users.id),
  },
  (table) => [
    uniqueIndex("role_permissions_role_permission_unique").on(
      table.roleId,
      table.permissionId,
    ),
  ],
);

export const users = pgTable("users", {
  ...idColumn,
  username: varchar("username", { length: 100 }).notNull().unique(),
  fullName: varchar("full_name", { length: 200 }).notNull(),
  phone: varchar("phone", { length: 30 }),
  // Bcrypt hash of the numeric counter PIN — the staff PIN-pad login
  // (auth.ts POST /login). Kept required: every account still gets a
  // PIN today, even an admin-only account with no counter duties, to
  // avoid a nullable-column ripple through the login/staff-list queries
  // for what's a rare case right now (2026-09-10) — flagged, not solved.
  passwordHash: text("password_hash").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  // Failed-PIN lockout (added 2026-09-10, Mehmoon's direction): 5 wrong
  // PINs in a row locks the account for 15 minutes. Both numbers are
  // inferred defaults, not a client-confirmed policy — see auth.ts.
  failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  // Admin credentials — a SEPARATE credential from the PIN, not a reuse
  // of passwordHash, specifically so a staff member can be promoted to
  // admin without losing their PIN (added 2026-09-10, Mehmoon's
  // direction: "Ghaus will be the admin... can set other users as admin
  // too", with admin logging in via a separate screen, not the PIN pad).
  // `adminIdentifier` is deliberately not called "email" — Mehmoon's
  // follow-up direction the same day: blue-collar staff being granted
  // admin access often won't have an email address, so this accepts
  // either an email or a phone number as the login identifier. Nullable/
  // unique, only meaningful once `isAdmin` is true; `adminPasswordHash`
  // likewise.
  adminIdentifier: varchar("admin_identifier", { length: 200 }).unique(),
  isAdmin: boolean("is_admin").notNull().default(false),
  adminPasswordHash: text("admin_password_hash"),
  ...timestampColumns,
  createdBy: uuid("created_by").references((): AnyPgColumn => users.id),
  updatedBy: uuid("updated_by").references((): AnyPgColumn => users.id),
});

/**
 * [unclear — confirm] Whether a user can hold more than one role at once, or
 * exactly one. Modeled as many-to-many since that's a strict superset of
 * "one role per user" (enforce one-per-user in the application layer if that
 * turns out to be the answer) rather than guessing and having to migrate a
 * users.role_id column into a join table later.
 */
export const userRoles = pgTable(
  "user_roles",
  {
    ...idColumn,
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    ...timestampColumns,
    createdBy: uuid("created_by").references((): AnyPgColumn => users.id),
    updatedBy: uuid("updated_by").references((): AnyPgColumn => users.id),
  },
  (table) => [
    uniqueIndex("user_roles_user_role_unique").on(table.userId, table.roleId),
  ],
);
