import { useState, type FormEvent } from "react";
import { login, type LoginResult } from "./api.js";

/**
 * Functional-first pass, not a recreation of the glassmorphism UI concept
 * (https://claude.ai/code/artifact/ba934bdb-69f8-4233-a70a-c6c26412aeaf) —
 * the point of this screen is proving the real login path works (real
 * bcrypt check against the real users table), not final visual polish.
 * Matching that design is a follow-up once the data path is proven out.
 */
export function LoginView({ onLoggedIn }: { onLoggedIn: (user: LoginResult) => void }) {
  const [username, setUsername] = useState("asif.raza");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await login(username, pin);
      onLoggedIn(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 360, margin: "80px auto", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 20 }}>Kayani Autos — Staff Login</h1>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label>
          Username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{ display: "block", width: "100%", padding: 10, fontSize: 16 }}
          />
        </label>
        <label>
          PIN
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            style={{ display: "block", width: "100%", padding: 10, fontSize: 16 }}
          />
        </label>
        {error && <div style={{ color: "#c2410c", fontWeight: 600 }}>{error}</div>}
        <button
          type="submit"
          disabled={loading}
          style={{ padding: 12, fontSize: 16, fontWeight: 700, cursor: "pointer" }}
        >
          {loading ? "Checking..." : "Unlock"}
        </button>
      </form>
      <p style={{ color: "#888", fontSize: 13, marginTop: 16 }}>
        Dev sample account: asif.raza / PIN 1234
      </p>
    </div>
  );
}
