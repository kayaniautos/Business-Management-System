import { useEffect, useState } from "react";
import { getStaff, login, type LoginResult, type StaffMember } from "./api.js";
import { AdminLoginView } from "./AdminLoginView.js";

const MAX_PIN_LENGTH = 6;
const AVATAR_COLORS = ["#c2410c", "#2563eb", "#047857", "#7c3aed"];

/**
 * Real login screen matching the approved UI concept
 * (https://claude.ai/code/artifact/ba934bdb-69f8-4233-a70a-c6c26412aeaf):
 * staff picker (real data from GET /api/auth/staff, not hardcoded) + a
 * numeric PIN pad, unlocking against the real bcrypt-checked login
 * endpoint. Business contact info in the footer is the confirmed real
 * address/phone/email from CLAUDE.md — same content, real component now
 * instead of a static mockup.
 */
export function LoginView({ onLoggedIn }: { onLoggedIn: (user: LoginResult) => void }) {
  const [mode, setMode] = useState<"staff" | "admin">("staff");
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [selected, setSelected] = useState<StaffMember | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getStaff()
      .then((list) => {
        setStaff(list);
        if (list.length > 0) setSelected(list[0]);
      })
      .catch((err) => setStaffError(err instanceof Error ? err.message : "Could not load staff"));
  }, []);

  function pressDigit(digit: string) {
    setError(null);
    setPin((prev) => (prev.length < MAX_PIN_LENGTH ? prev + digit : prev));
  }

  function pressBackspace() {
    setError(null);
    setPin((prev) => prev.slice(0, -1));
  }

  async function unlock() {
    if (!selected || pin.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const user = await login(selected.username, pin);
      onLoggedIn(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setPin("");
    } finally {
      setLoading(false);
    }
  }

  if (mode === "admin") {
    return <AdminLoginView onLoggedIn={onLoggedIn} onBack={() => setMode("staff")} />;
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div className="glass-card" style={{ width: "100%", maxWidth: 720, padding: "40px 44px", display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <img src="/kt-logo.png" alt="Kiyan Traders" className="brand-logo" />
            <div style={{ width: 1, height: 30, background: "var(--line)" }} />
            <img src="/ka-logo.png" alt="Kiyani Auto Toyota" className="brand-logo" />
          </div>
          <div className="muted" style={{ fontSize: 13, fontWeight: 600 }}>Counter &middot; Inventory &middot; Accounts</div>
        </div>

        <div style={{ height: 1, background: "var(--line)" }} />

        <div>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14 }}>Who&rsquo;s working the counter?</div>
          {staffError && <div className="error-text">{staffError}</div>}
          {staff === null && !staffError && <div className="muted">Loading staff...</div>}
          {staff && staff.length === 0 && <div className="muted">No active staff accounts yet.</div>}
          {staff && staff.length > 0 && (
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {staff.map((member, i) => (
                <button
                  key={member.id}
                  type="button"
                  className={`staff-tile${selected?.id === member.id ? " selected" : ""}`}
                  onClick={() => {
                    setSelected(member);
                    setPin("");
                    setError(null);
                  }}
                >
                  <div className="staff-avatar" style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}>
                    {member.fullName
                      .split(" ")
                      .map((p) => p[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{member.fullName}</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>{member.roles.join(", ") || "No role assigned"}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {selected && (
          <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200, display: "flex", flexDirection: "column", justifyContent: "center", gap: 14 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>Enter your PIN</div>
                <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                  {selected.fullName} &middot; {selected.roles.join(", ") || "No role assigned"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className={`pin-dot${i < pin.length ? " filled" : ""}`} />
                ))}
              </div>
              {error && <div className="error-text">{error}</div>}
              <button type="button" className="btn-primary" style={{ width: 200 }} disabled={loading || pin.length === 0} onClick={unlock}>
                {loading ? "Checking..." : "Unlock & start shift"}
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, width: 260 }}>
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <button key={d} type="button" className="keypad-btn" onClick={() => pressDigit(d)}>
                  {d}
                </button>
              ))}
              <button
                type="button"
                className="keypad-btn"
                style={{ background: "oklch(96% 0.01 260)", fontSize: 13, fontWeight: 700 }}
                onClick={() => setPin("")}
              >
                Clear
              </button>
              <button type="button" className="keypad-btn" onClick={() => pressDigit("0")}>
                0
              </button>
              <button
                type="button"
                className="keypad-btn"
                style={{ background: "oklch(96% 0.01 260)" }}
                onClick={pressBackspace}
              >
                &larr;
              </button>
            </div>
          </div>
        )}

        <div style={{ height: 1, background: "var(--line)" }} />
        <div className="muted" style={{ textAlign: "center", fontSize: 12, display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
          <span>Kiyani Auto Market, Gawalmandi Road, Rawalpindi</span>
          <span>051-5552489 / 5530887 &middot; 0339-4007532</span>
          <span>kiyantraderstoyotta@gmail.com</span>
        </div>
        <button
          type="button"
          onClick={() => setMode("admin")}
          style={{ border: "none", background: "none", cursor: "pointer", color: "var(--ink-500)", fontSize: 12, minHeight: 44 }}
        >
          Admin sign in
        </button>
      </div>
    </div>
  );
}
