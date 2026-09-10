import { useEffect, useState, type FormEvent } from "react";
import {
  createDealPart,
  getDealParts,
  searchParts,
  type DealPart,
  type PartSearchResult,
} from "./api.js";

interface DraftComponent {
  controlPartId: string;
  partNumber: string;
  name: string;
  quantity: number;
}

/**
 * Deal Part (Form C, CLAUDE.md 5.4) — bundle definition management. This
 * is the "recipe" screen only: pricing is deliberately NOT set here
 * ("decided at time of sale, not cached on the Deal Part definition" —
 * CLAUDE.md 5.4). Selling a bundle happens from the POS screen, which
 * enters the gross price at sale time same as any other line.
 */
export function DealPartView() {
  const [deals, setDeals] = useState<DealPart[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [printName, setPrintName] = useState("");
  const [description, setDescription] = useState("");
  const [components, setComponents] = useState<DraftComponent[]>([]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PartSearchResult[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  function load() {
    getDealParts().then(setDeals).catch((e) => setError(e instanceof Error ? e.message : "Could not load deal parts"));
  }

  useEffect(load, []);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    try {
      setResults(await searchParts(q));
    } catch {
      setResults([]);
    }
  }

  function addComponent(part: PartSearchResult) {
    setComponents((prev) => {
      if (prev.some((c) => c.controlPartId === part.id)) return prev;
      return [...prev, { controlPartId: part.id, partNumber: part.partNumber, name: part.name, quantity: 1 }];
    });
  }

  function updateComponentQty(controlPartId: string, quantity: number) {
    setComponents((prev) => prev.map((c) => (c.controlPartId === controlPartId ? { ...c, quantity } : c)));
  }

  function removeComponent(controlPartId: string) {
    setComponents((prev) => prev.filter((c) => c.controlPartId !== controlPartId));
  }

  async function handleCreate() {
    if (!printName.trim() || components.length < 2) return;
    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      const created = await createDealPart({
        printName: printName.trim(),
        description: description.trim() || undefined,
        components: components.map((c) => ({ controlPartId: c.controlPartId, quantity: c.quantity })),
      });
      setSaved(`Saved — "${created.printName}" with ${created.components.length} items.`);
      setPrintName("");
      setDescription("");
      setComponents([]);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save deal part");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ flex: 1, display: "flex", gap: 20, padding: 24, overflow: "hidden" }}>
      <div style={{ flex: 1.4, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>Deal parts</div>

        {error && <div className="error-text">{error}</div>}
        {deals.length === 0 && <div className="muted" style={{ fontSize: 13 }}>No deal parts yet.</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {deals.map((d) => (
            <div key={d.id} className="glass-card" style={{ padding: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{d.printName}</div>
              {d.description && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{d.description}</div>}
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                {d.components.map((c) => (
                  <div key={c.controlPartId} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                    <span>{c.name} <span className="muted">({c.partNumber})</span></span>
                    <span className="muted">&times; {c.quantity}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="glass-card" style={{ width: 420, flexShrink: 0, display: "flex", flexDirection: "column", padding: 20, gap: 14, overflowY: "auto" }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>New deal part</div>

        <input
          placeholder="Print name (e.g. Oil Change Combo)"
          value={printName}
          onChange={(e) => setPrintName(e.target.value)}
          style={{ padding: 10, fontSize: 14, borderRadius: 10, border: "1px solid var(--line)" }}
        />
        <textarea
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={{ padding: 10, fontSize: 13, minHeight: 56, fontFamily: "inherit", borderRadius: 10, border: "1px solid var(--line)" }}
        />

        <div style={{ fontWeight: 700, fontSize: 13.5, marginTop: 4 }}>Items in this bundle</div>
        {components.length === 0 && <div className="muted" style={{ fontSize: 12.5 }}>Add at least two items below.</div>}
        {components.map((c) => (
          <div key={c.controlPartId} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
            <span style={{ flex: 1 }}>{c.name} <span className="muted">({c.partNumber})</span></span>
            <label className="muted" style={{ fontSize: 11 }}>
              Qty
              <input
                type="number"
                min={1}
                value={c.quantity}
                onChange={(e) => updateComponentQty(c.controlPartId, Math.max(1, Number(e.target.value)))}
                style={{ width: 50, marginLeft: 6, padding: 4 }}
              />
            </label>
            <button type="button" onClick={() => removeComponent(c.controlPartId)} style={{ border: "none", background: "none", color: "var(--ink-300)", cursor: "pointer", minHeight: 32 }}>
              Remove
            </button>
          </div>
        ))}

        <form onSubmit={handleSearch} style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search part number or name..."
            style={{ flex: 1, padding: "10px 12px", fontSize: 13, borderRadius: 10, border: "1px solid var(--line)", background: "white" }}
          />
          <button type="submit" className="btn-primary" style={{ padding: "0 16px" }}>Search</button>
        </form>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 160, overflowY: "auto" }}>
          {results.map((part) => (
            <div key={part.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5, padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
              <span>{part.name} <span className="muted">({part.partNumber})</span></span>
              <button type="button" onClick={() => addComponent(part)} style={{ padding: "4px 10px", cursor: "pointer" }}>Add</button>
            </div>
          ))}
        </div>

        {error && <div className="error-text">{error}</div>}
        {saved && (
          <div style={{ background: "oklch(95% 0.05 150)", borderRadius: 12, padding: 12, fontSize: 13 }}>
            {saved}
          </div>
        )}

        <button
          type="button"
          className="btn-primary"
          disabled={saving || !printName.trim() || components.length < 2}
          onClick={handleCreate}
        >
          {saving ? "Saving..." : "Save deal part"}
        </button>
      </div>
    </div>
  );
}
