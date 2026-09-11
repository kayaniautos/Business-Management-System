import { useEffect, useState, type FormEvent } from "react";
import {
  createStockAdjustment,
  getPartQuantity,
  getStockAdjustments,
  searchParts,
  type PartSearchResult,
  type StockAdjustment,
} from "./api.js";

/**
 * Stock Adjustment (Form F, CLAUDE.md 5.7). First screen to write to the
 * new stock_movements ledger (src/db/schema/stock-movements.ts) — no
 * other feature yet tracks a real quantity-on-hand, so this is also the
 * first place a "current qty" figure appears anywhere in the app.
 *
 * Single-step flow per the client's own notes: pick one item, see its
 * current qty, enter a +/- delta with a mandatory comment, save. There is
 * no separate draft/post stage here unlike Quotation/DN/Invoice — see the
 * backend route's own comment for why that wasn't invented.
 */
export function StockAdjustmentView() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PartSearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [selected, setSelected] = useState<PartSearchResult | null>(null);
  const [currentQty, setCurrentQty] = useState<number | null>(null);
  const [currentUnitCost, setCurrentUnitCost] = useState<string | null>(null);
  const [delta, setDelta] = useState("");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const [history, setHistory] = useState<StockAdjustment[]>([]);

  function loadHistory() {
    getStockAdjustments().then(setHistory).catch(() => {});
  }

  useEffect(loadHistory, []);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    setSearchError(null);
    try {
      setResults(await searchParts(q));
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
    }
  }

  async function selectPart(part: PartSearchResult) {
    setSelected(part);
    setError(null);
    setSavedMessage(null);
    setDelta("");
    setComment("");
    try {
      const { quantity, currentUnitCost: unitCost } = await getPartQuantity(part.id);
      setCurrentQty(quantity);
      setCurrentUnitCost(unitCost);
    } catch {
      setCurrentQty(null);
      setCurrentUnitCost(null);
    }
  }

  const deltaNumber = Number(delta);
  const newQty = currentQty !== null && delta && !Number.isNaN(deltaNumber) ? currentQty + deltaNumber : null;

  async function handleSave() {
    if (!selected || !delta || deltaNumber === 0 || !comment.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const result = await createStockAdjustment({
        controlPartId: selected.id,
        quantityDelta: deltaNumber,
        reasonComment: comment.trim(),
      });
      setCurrentQty(result.quantityAfter);
      setDelta("");
      setComment("");
      setSavedMessage(`Saved — ${selected.name} is now ${result.quantityAfter} in stock.`);
      loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save adjustment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ flex: 1, display: "flex", gap: 20, padding: 24, overflow: "hidden" }}>
      <div style={{ flex: 1.4, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>Stock adjustment</div>

        <form onSubmit={handleSearch} style={{ display: "flex", gap: 10 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search part number or name..."
            style={{ flex: 1, padding: "14px 16px", fontSize: 15, borderRadius: 14, border: "1px solid var(--line)", background: "white" }}
          />
          <button type="submit" className="btn-primary" style={{ padding: "0 26px" }}>Search</button>
        </form>
        {searchError && <div className="error-text">{searchError}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
          {results.map((part) => (
            <div
              key={part.id}
              className="glass-card"
              style={{
                padding: 14,
                display: "flex",
                flexDirection: "column",
                gap: 6,
                border: selected?.id === part.id ? "2px solid var(--accent)" : undefined,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{part.name}</div>
              <div className="muted" style={{ fontSize: 11 }}>{part.partNumber}</div>
              <button type="button" className="btn-primary" onClick={() => selectPart(part)}>
                {selected?.id === part.id ? "Selected" : "Select"}
              </button>
            </div>
          ))}
        </div>

        <div style={{ fontWeight: 700, fontSize: 16, marginTop: 8 }}>Recent adjustments</div>
        {history.length === 0 && <div className="muted" style={{ fontSize: 13 }}>No adjustments recorded yet.</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {history.map((h) => (
            <div key={h.id} className="glass-card" style={{ padding: 12, fontSize: 12.5 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 700 }}>{h.partName} <span className="muted">({h.partNumber})</span></span>
                <span style={{ fontWeight: 800, color: h.quantityDelta > 0 ? "oklch(45% 0.13 150)" : "oklch(55% 0.18 25)" }}>
                  {h.quantityDelta > 0 ? "+" : ""}{h.quantityDelta}
                </span>
              </div>
              <div className="muted" style={{ marginTop: 4 }}>{h.reasonComment}</div>
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                {new Date(h.createdAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="glass-card" style={{ width: 380, flexShrink: 0, display: "flex", flexDirection: "column", padding: 20, gap: 14, overflowY: "auto" }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>Adjust quantity</div>

        {!selected && <div className="muted" style={{ fontSize: 13 }}>Search and select a part to adjust.</div>}

        {selected && (
          <>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{selected.name}</div>
              <div className="muted" style={{ fontSize: 12 }}>{selected.partNumber}</div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span className="muted">Current quantity</span>
              <span style={{ fontWeight: 800 }}>{currentQty ?? "..."}</span>
            </div>

            {currentUnitCost !== null && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span className="muted">Last received cost (LIFO)</span>
                <span style={{ fontWeight: 700 }}>Rs {currentUnitCost}</span>
              </div>
            )}

            <label className="muted" style={{ fontSize: 12 }}>
              Adjustment (+/-)
              <input
                type="number"
                value={delta}
                onChange={(e) => setDelta(e.target.value)}
                placeholder="e.g. -5 or 20"
                style={{ display: "block", width: "100%", padding: 10, marginTop: 4, fontSize: 14 }}
              />
            </label>

            <label className="muted" style={{ fontSize: 12 }}>
              Reason (required)
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Why is this being adjusted? e.g. damaged in storage, physical recount, shrinkage"
                style={{ display: "block", width: "100%", padding: 10, marginTop: 4, fontSize: 13.5, minHeight: 80, fontFamily: "inherit" }}
              />
            </label>

            {newQty !== null && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span className="muted">New quantity</span>
                <span style={{ fontWeight: 800 }}>{newQty}</span>
              </div>
            )}

            {error && <div className="error-text">{error}</div>}
            {savedMessage && (
              <div style={{ background: "oklch(95% 0.05 150)", borderRadius: 12, padding: 12, fontSize: 13 }}>
                {savedMessage}
              </div>
            )}

            <button
              type="button"
              className="btn-primary"
              disabled={saving || !delta || deltaNumber === 0 || !comment.trim()}
              onClick={handleSave}
            >
              {saving ? "Saving..." : "Save adjustment"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
