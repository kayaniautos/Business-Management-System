import { useState, type FormEvent } from "react";
import { adminLogin, type LoginResult } from "./api.js";

/**
 * Separate admin login (email-or-phone + password), distinct from the
 * staff PIN pad (LoginView.tsx) — Mehmoon's direction 2026-09-10: Ghaus
 * needs full access via his own credential, not a guessable counter PIN,
 * and the two are genuinely different credentials on the same `users`
 * row (see src/db/schema/users.ts). The identifier accepts a phone
 * number as well as an email — blue-collar staff granted admin access
 * often don't have an email address. Reached via a link from the staff
 * login screen, not merged into it.
 */
export function AdminLoginView({
  onLoggedIn,
  onBack,
}: {
  onLoggedIn: (user: LoginResult) => void;
  onBack: () => void;
}) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!identifier.trim() || !password) return;
    setLoading(true);
    setError(null);
    try {
      const user = await adminLogin(identifier.trim(), password);
      onLoggedIn(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Admin login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div className="glass-card" style={{ width: "100%", maxWidth: 420, padding: "40px 44px", display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <img src="/kt-logo.png" alt="Kiyan Traders" className="brand-logo" />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>Admin sign in</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>For system administration, not counter use.</div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            type="text"
            placeholder="Email or phone number"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoFocus
            style={{ padding: 12, fontSize: 14, borderRadius: 10, border: "1px solid var(--line)" }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ padding: 12, fontSize: 14, borderRadius: 10, border: "1px solid var(--line)" }}
          />
          {error && <div className="error-text">{error}</div>}
          <button type="submit" className="btn-primary" disabled={loading || !identifier.trim() || !password}>
            {loading ? "Checking..." : "Sign in"}
          </button>
        </form>

        <button
          type="button"
          onClick={onBack}
          style={{ border: "none", background: "none", cursor: "pointer", color: "var(--ink-500)", fontSize: 13, minHeight: 44 }}
        >
          &larr; Back to counter login
        </button>
      </div>
    </div>
  );
}
