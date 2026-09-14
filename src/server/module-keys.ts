/**
 * The fixed set of nav modules role-based access control (CLAUDE.md 5.8-
 * adjacent, built 2026-09-14) can grant or withhold. Matches AppHeader.tsx's
 * own nav grouping exactly: "pos" and "parties" are the two standalone
 * always-present tabs, the rest match its `MODULES` dropdown groups.
 * Admin Settings is deliberately NOT one of these — it's gated purely by
 * `users.isAdmin`, unrelated to a role's module grants.
 */
export const MODULE_KEYS = ["pos", "parties", "sales", "inventory", "purchasing"] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];
