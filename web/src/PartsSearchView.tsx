import { useState, type FormEvent } from "react";
import { searchParts, type LoginResult, type PartSearchResult } from "./api.js";

export function PartsSearchView({ user }: { user: LoginResult }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PartSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      setResults(await searchParts(q));
      setSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    }
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      <div
        style={{
          height: 72,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 28px",
          background: "oklch(99% 0.004 85 / .6)",
          backdropFilter: "blur(24px)",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <img src="/kt-logo.png" alt="Kiyan Traders" className="brand-logo" style={{ height: 36 }} />
        <div style={{ fontWeight: 700, fontSize: 13.5 }}>
          {user.fullName} <span className="muted">&middot; {user.roles.join(", ") || "No role"}</span>
        </div>
      </div>

      <div style={{ maxWidth: 720, margin: "32px auto", padding: "0 20px" }}>
        <form onSubmit={handleSearch} style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search part number or name..."
            style={{
              flex: 1,
              padding: "14px 16px",
              fontSize: 15,
              borderRadius: 14,
              border: "1px solid var(--line)",
              background: "white",
            }}
          />
          <button type="submit" className="btn-primary" style={{ padding: "0 26px" }}>
            Search
          </button>
        </form>
        {error && <div className="error-text">{error}</div>}
        {searched && results.length === 0 && !error && <p className="muted">No parts found for &ldquo;{q}&rdquo;.</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {results.map((part) => (
            <div key={part.id} className="glass-card" style={{ padding: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{part.name}</div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                {part.partNumber} &middot; {part.markerName ?? "Uncategorized"} / {part.itemName ?? "-"}
              </div>
              {part.fitment.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 12.5 }}>
                  Fits: {part.fitment.map((f) => `${f.make} ${f.model}`).join(", ")}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
