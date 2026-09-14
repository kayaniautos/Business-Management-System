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

/**
 * Which top-level NAV MODULES (POS/Parties/Sales/Inventory/Purchasing —
 * see `server/module-keys.ts` for the fixed list) a role's members can
 * even see, built 2026-09-14 per Mehmoon's direct request: "each user
 * role will have access to only its relevant modules, unless the admin
 * selects multiple or all modules for them... admin will have access to
 * everything."
 *
 * Deliberately a SEPARATE, simpler concept from `permissions`/
 * `role_permissions` above — this is coarse nav-level screen visibility
 * (can this role even open the Inventory module at all), not the finer
 * action-level authority (can this role approve a discount, see cost/
 * margin) CLAUDE.md 5.8 reserves for the still-unscoped Authority Levels
 * conversation. `moduleKey` is a plain string, not a foreign key into a
 * managed catalog table like `permissions` is — the module list is a
 * small, fixed set the frontend nav itself defines, not something an
 * admin creates/edits entries for.
 *
 * `isAdmin` (on `users`) bypasses this entirely and always sees every
 * module, per Mehmoon's own framing above — module access only applies
 * to a non-admin user's role(s).
 *
 * Enforced UI-side only, same as every other access rule in this app
 * right now (no session/auth-token gating exists yet on the API itself —
 * see app.ts's own comment) — a real backend enforcement layer needs
 * that broader auth work first, not something to bolt on narrowly here.
 */
export const roleModules = pgTable(
  "role_modules",
  {
    ...idColumn,
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    moduleKey: varchar("module_key", { length: 50 }).notNull(),
    ...timestampColumns,
    createdBy: uuid("created_by").references((): AnyPgColumn => users.id),
    updatedBy: uuid("updated_by").references((): AnyPgColumn => users.id),
  },
  (table) => [
    uniqueIndex("role_modules_role_module_unique").on(
      table.roleId,
      table.moduleKey,
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
