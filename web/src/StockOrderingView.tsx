import { useEffect, useState } from "react";
import {
  createPurchaseOrder,
  getEntities,
  getParties,
  getReorderSuggestions,
  type LegalEntity,
  type Party,
  type PurchaseDocumentResult,
  type ReorderSuggestion,
} from "./api.js";

interface OrderLine {
  quantity: number;
  unitCost: number;
  selected: boolean;
}

/**
 * Stock Ordering (Form E, CLAUDE.md 5.6) — on-demand reorder suggestions
 * based on Safety Stock Days, feeding straight into a real Purchase
 * Order. See stock-ordering.ts's own header comment for what "Safety
 * Stock Days" means here (a literal reorder-point quantity, not a true
 * days-of-cover calculation — flagged `[unclear — confirm]` there).
 *
 * A flagged part's default order quantity tops it back up to its own
 * threshold (`safetyStockDays - quantity`, floored at 1) — a reasonable
 * starting point, freely editable before the order is created.
 */
export function StockOrderingView() {
  const [suggestions, setSuggestions] = useState<ReorderSuggestion[] | null>(null);
  const [lines, setLines] = useState<Record<string, OrderLine>>({});
  const [loadError, setLoadError] = useState<string | null>(null);

  const [entities, setEntities] = useState<LegalEntity[] | null>(null);
  const [entityId, setEntityId] = useState("");
  const [suppliers, setSuppliers] = useState<Party[]>([]);
  const [partyId, setPartyId] = useState("");
  const [supplierRef, setSupplierRef] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<PurchaseDocumentResult | null>(null);

  function loadSuggestions() {
    getReorderSuggestions()
      .then((rows) => {
        setSuggestions(rows);
        setLines(
          Object.fromEntries(
            rows.map((r) => [
              r.controlPartId,
              {
                quantity: Math.max(1, r.safetyStockDays - r.quantity),
                unitCost: r.currentUnitCost ? Number(r.currentUnitCost) : 0,
                selected: true,
              },
            ]),
          ),
        );
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Could not load reorder suggestions"));
  }

  useEffect(() => {
    loadSuggestions();
    getEntities().then((list) => {
      setEntities(list);
      if (list.length > 0) setEntityId(list[0].id);
    });
    Promise.all([getParties({ nature: "S1" }), getParties({ nature: "S2" })])
      .then(([s1, s2]) => setSuppliers([...s1, ...s2]))
      .catch(() => {});
  }, []);

  function updateLine(controlPartId: string, patch: Partial<OrderLine>) {
    setLines((prev) => ({ ...prev, [controlPartId]: { ...prev[controlPartId], ...patch } }));
  }

  const selectedRows = (suggestions ?? []).filter((s) => lines[s.controlPartId]?.selected);
  const total = selectedRows.reduce((sum, r) => sum + lines[r.controlPartId].quantity * lines[r.controlPartId].unitCost, 0);

  async function handleCreate() {
    if (!entityId || !partyId || selectedRows.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const created = await createPurchaseOrder({
        legalEntityId: entityId,
        partyId,
        supplierRef: supplierRef.trim() || undefined,
        lines: selectedRows.map((r) => ({
          controlPartId: r.controlPartId,
          quantity: lines[r.controlPartId].quantity,
          unitCost: lines[r.controlPartId].unitCost,
        })),
      });
      setResult(created);
      setSupplierRef("");
      loadSuggestions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create purchase order");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="view-row">
      <div className="view-main" style={{ flex: 1.4, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>Reorder suggestions</div>
        <div className="muted" style={{ fontSize: 12 }}>
          Parts whose current quantity has dropped to or below their Safety Stock Days threshold (set on the Item, Inventory screen).
        </div>
        {loadError && <div className="error-text">{loadError}</div>}
        {suggestions && suggestions.length === 0 && !loadError && (
          <div className="muted" style={{ fontSize: 13 }}>Nothing needs reordering right now.</div>
        )}

        {(suggestions ?? []).map((s) => {
          const line = lines[s.controlPartId];
          if (!line) return null;
          return (
            <div key={s.controlPartId} className="glass-card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={line.selected}
                    onChange={(e) => updateLine(s.controlPartId, { selected: e.target.checked })}
                    style={{ marginTop: 4 }}
                  />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{s.partName}</div>
                    <div className="muted" style={{ fontSize: 11 }}>{s.partNumber} &middot; {s.itemName}</div>
                  </div>
                </label>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: "oklch(55% 0.18 25)" }}>{s.quantity}</div>
                  <div className="muted" style={{ fontSize: 10.5 }}>on hand &middot; threshold {s.safetyStockDays}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", paddingLeft: 26 }}>
                <label className="muted" style={{ fontSize: 11 }}>
                  Order qty
                  <input
                    type="number"
                    min={1}
                    value={line.quantity}
                    onChange={(e) => updateLine(s.controlPartId, { quantity: Math.max(1, Number(e.target.value)) })}
                    style={{ width: 60, marginLeft: 6, padding: 6 }}
                  />
                </label>
                <label className="muted" style={{ fontSize: 11 }}>
                  Unit cost (Rs)
                  <input
                    type="number"
                    min={0}
                    value={line.unitCost || ""}
                    onChange={(e) => updateLine(s.controlPartId, { unitCost: Math.max(0, Number(e.target.value)) })}
                    style={{ width: 90, marginLeft: 6, padding: 6 }}
                  />
                </label>
              </div>
            </div>
          );
        })}
      </div>

      <div className="glass-card view-panel" style={{ width: 380, flexShrink: 0, display: "flex", flexDirection: "column", padding: 20, gap: 14, overflowY: "auto" }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>Create purchase order</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {entities && (
            <select value={entityId} onChange={(e) => setEntityId(e.target.value)} style={{ padding: 8, borderRadius: 10, border: "1px solid var(--line)", fontSize: 12.5 }}>
              {entities.map((ent) => (
                <option key={ent.id} value={ent.id}>{ent.name}</option>
              ))}
            </select>
          )}
          <select value={partyId} onChange={(e) => setPartyId(e.target.value)} style={{ padding: 8, borderRadius: 10, border: "1px solid var(--line)", fontSize: 12.5 }}>
            <option value="">Select supplier...</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <input placeholder="Supplier reference (their quote/order no.)" value={supplierRef} onChange={(e) => setSupplierRef(e.target.value)} style={{ padding: 8, fontSize: 12.5 }} />

        <div className="muted" style={{ fontSize: 12 }}>{selectedRows.length} part(s) selected</div>
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 18 }}>
          <span>Total</span>
          <span>Rs {total.toFixed(2)}</span>
        </div>

        {error && <div className="error-text">{error}</div>}

        <button type="button" className="btn-primary" disabled={selectedRows.length === 0 || !partyId || saving} onClick={handleCreate}>
          {saving ? "Saving..." : "Create purchase order"}
        </button>

        {result && (
          <div style={{ background: "oklch(95% 0.05 150)", borderRadius: 12, padding: 12, fontSize: 13 }}>
            Purchase order saved — <strong>{result.documentNumber}</strong>, total Rs {result.totalAmount}
          </div>
        )}
      </div>
    </div>
  );
}
