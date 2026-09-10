import { useEffect, useState } from "react";
import {
  activateUser,
  createAdminUser,
  createRole,
  deactivateUser,
  getAdminUsers,
  getRoles,
  grantAdmin,
  revokeAdmin,
  setUserRoles,
  type AdminUser,
  type Role,
} from "./api.js";

/**
 * Admin Settings — role and staff-account management (CLAUDE.md 5.8:
 * "the admin must be able to create arbitrary roles at runtime"), plus
 * granting/revoking admin access on any user (Mehmoon's direction
 * 2026-09-10: Ghaus is admin and can make other users admin too). This
 * is deliberately scoped to roles, users, and admin-status only — it
 * does NOT include a permissions-grant UI (what a role can actually
 * do). CLAUDE.md 5.8 is explicit that the `permissions`/`role_permissions`
 * catalog stays untouched until the Authority Levels scoping conversation
 * with the client happens; building a grant UI now would mean inventing
 * permission keys nobody has confirmed.
 *
 * The nav already hides this screen unless `user.isAdmin` (AppHeader.tsx),
 * but the API underneath still isn't session-gated (src/server/app.ts's
 * own comment) — a pre-existing limitation, not something new.
 */
export function AdminSettingsView() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDescription, setNewRoleDescription] = useState("");
  const [savingRole, setSavingRole] = useState(false);

  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [newUserRoleIds, setNewUserRoleIds] = useState<string[]>([]);
  const [savingUser, setSavingUser] = useState(false);

  const [grantingAdminFor, setGrantingAdminFor] = useState<string | null>(null);
  const [grantIdentifier, setGrantIdentifier] = useState("");
  const [grantPassword, setGrantPassword] = useState("");
  const [grantingBusy, setGrantingBusy] = useState(false);

  function loadRoles() {
    getRoles().then(setRoles).catch((e) => setError(e instanceof Error ? e.message : "Could not load roles"));
  }
  function loadUsers() {
    getAdminUsers().then(setUsers).catch((e) => setError(e instanceof Error ? e.message : "Could not load users"));
  }

  useEffect(() => {
    loadRoles();
    loadUsers();
  }, []);

  async function handleCreateRole() {
    if (!newRoleName.trim()) return;
    setSavingRole(true);
    setError(null);
    try {
      await createRole({ name: newRoleName.trim(), description: newRoleDescription.trim() || undefined });
      setNewRoleName("");
      setNewRoleDescription("");
      loadRoles();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create role");
    } finally {
      setSavingRole(false);
    }
  }

  function toggleNewUserRole(roleId: string) {
    setNewUserRoleIds((prev) => (prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]));
  }

  async function handleCreateUser() {
    if (!username.trim() || !fullName.trim() || !pin.trim()) return;
    setSavingUser(true);
    setError(null);
    try {
      await createAdminUser({
        username: username.trim(),
        fullName: fullName.trim(),
        phone: phone.trim() || undefined,
        pin: pin.trim(),
        roleIds: newUserRoleIds,
      });
      setUsername("");
      setFullName("");
      setPhone("");
      setPin("");
      setNewUserRoleIds([]);
      loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create user");
    } finally {
      setSavingUser(false);
    }
  }

  async function toggleUserRole(user: AdminUser, roleId: string) {
    const has = user.roles.some((r) => r.id === roleId);
    const nextRoleIds = has
      ? user.roles.filter((r) => r.id !== roleId).map((r) => r.id)
      : [...user.roles.map((r) => r.id), roleId];
    try {
      await setUserRoles(user.id, nextRoleIds);
      loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update roles");
    }
  }

  async function toggleActive(user: AdminUser) {
    try {
      if (user.isActive) await deactivateUser(user.id);
      else await activateUser(user.id);
      loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update user");
    }
  }

  function startGrantAdmin(userId: string) {
    setGrantingAdminFor(userId);
    setGrantIdentifier("");
    setGrantPassword("");
    setError(null);
  }

  async function handleGrantAdmin() {
    if (!grantingAdminFor || !grantIdentifier.trim() || grantPassword.length < 6) return;
    setGrantingBusy(true);
    setError(null);
    try {
      await grantAdmin(grantingAdminFor, grantIdentifier.trim(), grantPassword);
      setGrantingAdminFor(null);
      loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not grant admin access");
    } finally {
      setGrantingBusy(false);
    }
  }

  async function handleRevokeAdmin(user: AdminUser) {
    try {
      await revokeAdmin(user.id);
      loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not revoke admin access");
    }
  }

  return (
    <div style={{ flex: 1, display: "flex", gap: 20, padding: 24, overflow: "hidden" }}>
      <div style={{ flex: 1.4, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>Staff accounts</div>
        {error && <div className="error-text">{error}</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {users.map((u) => (
            <div key={u.id} className="glass-card" style={{ padding: 14, opacity: u.isActive ? 1 : 0.55 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
                    {u.fullName} <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>@{u.username}</span>
                    {u.isAdmin && (
                      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.3, color: "white", background: "var(--accent)", borderRadius: 6, padding: "2px 6px" }}>
                        ADMIN
                      </span>
                    )}
                  </div>
                  {u.phone && <div className="muted" style={{ fontSize: 11.5 }}>{u.phone}</div>}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {u.isAdmin ? (
                    <button
                      type="button"
                      onClick={() => handleRevokeAdmin(u)}
                      style={{ padding: "6px 14px", borderRadius: 10, border: "1px solid var(--line)", background: "white", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
                    >
                      Revoke admin
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startGrantAdmin(u.id)}
                      style={{ padding: "6px 14px", borderRadius: 10, border: "1px solid var(--line)", background: "white", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
                    >
                      Grant admin
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleActive(u)}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 10,
                      border: "1px solid var(--line)",
                      background: "white",
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    {u.isActive ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </div>

              {grantingAdminFor === u.id && (
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8, background: "oklch(97% 0.005 260)", borderRadius: 10, padding: 10 }}>
                  <div className="muted" style={{ fontSize: 11.5 }}>Email or phone number, and a password for admin sign-in</div>
                  <input
                    placeholder="Email or phone"
                    value={grantIdentifier}
                    onChange={(e) => setGrantIdentifier(e.target.value)}
                    style={{ padding: 8, fontSize: 13, borderRadius: 8, border: "1px solid var(--line)" }}
                  />
                  <input
                    type="password"
                    placeholder="Password (min 6 characters)"
                    value={grantPassword}
                    onChange={(e) => setGrantPassword(e.target.value)}
                    style={{ padding: 8, fontSize: 13, borderRadius: 8, border: "1px solid var(--line)" }}
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ flex: 1, padding: "8px 0", fontSize: 12.5 }}
                      disabled={grantingBusy || !grantIdentifier.trim() || grantPassword.length < 6}
                      onClick={handleGrantAdmin}
                    >
                      {grantingBusy ? "Saving..." : "Confirm"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setGrantingAdminFor(null)}
                      style={{ padding: "8px 14px", fontSize: 12.5, borderRadius: 8, border: "1px solid var(--line)", background: "white", cursor: "pointer" }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                {roles.map((r) => {
                  const has = u.roles.some((ur) => ur.id === r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => toggleUserRole(u, r.id)}
                      style={{
                        padding: "5px 12px",
                        borderRadius: 999,
                        border: "1px solid var(--line)",
                        fontSize: 11.5,
                        fontWeight: 700,
                        cursor: "pointer",
                        background: has ? "var(--ink-900)" : "white",
                        color: has ? "white" : "var(--ink-500)",
                      }}
                    >
                      {r.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ width: 420, flexShrink: 0, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
        <div className="glass-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>New staff account</div>
          <input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} style={{ padding: 10, fontSize: 14, borderRadius: 10, border: "1px solid var(--line)" }} />
          <input placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} style={{ padding: 10, fontSize: 14, borderRadius: 10, border: "1px solid var(--line)" }} />
          <input placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ padding: 10, fontSize: 14, borderRadius: 10, border: "1px solid var(--line)" }} />
          <input
            placeholder="PIN (4-6 digits)"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            style={{ padding: 10, fontSize: 14, borderRadius: 10, border: "1px solid var(--line)" }}
          />
          <div>
            <div className="muted" style={{ fontSize: 11.5, marginBottom: 6 }}>Roles</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {roles.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => toggleNewUserRole(r.id)}
                  style={{
                    padding: "5px 12px",
                    borderRadius: 999,
                    border: "1px solid var(--line)",
                    fontSize: 11.5,
                    fontWeight: 700,
                    cursor: "pointer",
                    background: newUserRoleIds.includes(r.id) ? "var(--ink-900)" : "white",
                    color: newUserRoleIds.includes(r.id) ? "white" : "var(--ink-500)",
                  }}
                >
                  {r.name}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            className="btn-primary"
            disabled={savingUser || !username.trim() || !fullName.trim() || !/^\d{4,6}$/.test(pin)}
            onClick={handleCreateUser}
          >
            {savingUser ? "Saving..." : "Create staff account"}
          </button>
        </div>

        <div className="glass-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>New role</div>
          <input placeholder="Role name" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} style={{ padding: 10, fontSize: 14, borderRadius: 10, border: "1px solid var(--line)" }} />
          <textarea
            placeholder="Description (optional)"
            value={newRoleDescription}
            onChange={(e) => setNewRoleDescription(e.target.value)}
            style={{ padding: 10, fontSize: 13, minHeight: 56, fontFamily: "inherit", borderRadius: 10, border: "1px solid var(--line)" }}
          />
          <button type="button" className="btn-primary" disabled={savingRole || !newRoleName.trim()} onClick={handleCreateRole}>
            {savingRole ? "Saving..." : "Create role"}
          </button>
        </div>
      </div>
    </div>
  );
}
