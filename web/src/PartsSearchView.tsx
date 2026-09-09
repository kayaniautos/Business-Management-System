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
    <div style={{ maxWidth: 640, margin: "40px auto", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 20 }}>
        Kayani Autos — signed in as {user.fullName} ({user.roles.join(", ")})
      </h1>
      <form onSubmit={handleSearch} style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search part number or name..."
          style={{ flex: 1, padding: 10, fontSize: 16 }}
        />
        <button type="submit" style={{ padding: "10px 20px", fontSize: 16, cursor: "pointer" }}>
          Search
        </button>
      </form>
      {error && <div style={{ color: "#c2410c", fontWeight: 600 }}>{error}</div>}
      {searched && results.length === 0 && !error && <p>No parts found for "{q}".</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {results.map((part) => (
          <div key={part.id} style={{ border: "1px solid #ddd", borderRadius: 10, padding: 14 }}>
            <div style={{ fontWeight: 700 }}>{part.name}</div>
            <div style={{ color: "#666", fontSize: 13 }}>
              {part.partNumber} &middot; {part.markerName ?? "Uncategorized"} / {part.itemName ?? "-"}
            </div>
            {part.fitment.length > 0 && (
              <div style={{ marginTop: 6, fontSize: 13 }}>
                Fits: {part.fitment.map((f) => `${f.make} ${f.model}`).join(", ")}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
