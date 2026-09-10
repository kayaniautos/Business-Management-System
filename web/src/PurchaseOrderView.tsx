import { useEffect, useState, type FormEvent } from "react";
import {
  createPurchaseOrder,
  getEntities,
  getParties,
  searchParts,
  type LegalEntity,
  type Party,
  type PartSearchResult,
  type PurchaseDocumentResult,
} from "./api.js";

interface PoLine {
  controlPartId: string;
  partNumber: string;
  name: string;
  quantity: number;
  unitCost: number;
}

/**
 * First real Purchase Order creation (CLAUDE.md section 7 / handover doc
 * 6.3). Purely informational, like a Quotation on the sales side — it
 * records what was ordered, from whom, at what price, ahead of a Goods
 * Receipt; it's never posted and has no stock effect.
 *
 * The supplier picker filters to Nature S1/S2 parties (Vendors/Suppliers
 * A/C, Market Supplier A/C — CLAUDE.md 5.5), the mirror image of the
 * sales customer picker's Nature S3 filter.
 */
export function PurchaseOrderView() {
  const [entities, setEntities] = useState<LegalEntity[] | null>(null);
  const [entityId, setEntityId] = useState<string>("");
  const [suppliers, setSuppliers] = useState<Party[]>([]);
  const [partyId, setPartyId] = useState<string>("");
  const [supplierRef, setSupplierRef] = useState("");

  const [q, setQ] = useState("");
  const [results, setResults] = useState<PartSearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [lines, setLines] = useState<PoLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<PurchaseDocumentResult | null>(null);

  useEffect(() => {
    getEntities().then((list) => {
      setEntities(list);
      if (list.length > 0) setEntityId(list[0].id);
    });
    Promise.all([getParties({ nature: "S1" }), getParties({ nature: "S2" })])
      .then(([s1, s2]) => setSuppliers([...s1, ...s2]))
      .catch(() => {});
  }, []);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    setSearchError(null);
    try {
      setResults(await searchParts(q));
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
    }
  }

  function addLine(part: PartSearchResult) {
    if (part.isDealPart) return;
    setLines((prev) => {
      const existing = prev.find((l) => l.controlPartId === part.id);
      if (existing) {
        return prev.map((l) => (l.controlPartId === part.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, { controlPartId: part.id, partNumber: part.partNumber ?? "", name: part.name, quantity: 1, unitCost: 0 }];
    });
  }

  function updateLine(controlPartId: string, patch: Partial<PoLine>) {
    setLines((prev) => prev.map((l) => (l.controlPartId === controlPartId ? { ...l, ...patch } : l)));
  }

  function removeLine(controlPartId: string) {
    setLines((prev) => prev.filter((l) => l.controlPartId !== controlPartId));
  }

  const total = lines.reduce((sum, l) => sum + l.quantity * l.unitCost, 0);

  async function handleCreate() {
    if (!entityId || !partyId || lines.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const created = await createPurchaseOrder({
        legalEntityId: entityId,
        partyId,
        supplierRef: supplierRef.trim() || undefined,
        lines: lines.map((l) => ({ controlPartId: l.controlPartId, quantity: l.quantity, unitCost: l.unitCost })),
      });
      setResult(created);
      setLines([]);
      setSupplierRef("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create purchase order");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ flex: 1, display: "flex", gap: 20, padding: 24, overflow: "hidden" }}>
      <div style={{ flex: 1.4, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>New purchase order</div>

        <div className="glass-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
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
        </div>

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
          {results.filter((part) => !part.isDealPart).map((part) => (
            <div key={part.id} className="glass-card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{part.name}</div>
              <div className="muted" style={{ fontSize: 11 }}>{part.partNumber}</div>
              <button type="button" className="btn-primary" onClick={() => addLine(part)}>Add</button>
            </div>
          ))}
        </div>
      </div>

      <div className="glass-card" style={{ width: 380, flexShrink: 0, display: "flex", flexDirection: "column", padding: 20, gap: 14, overflowY: "auto" }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>Order lines</div>

        {lines.length === 0 && <div className="muted" style={{ fontSize: 13 }}>No lines yet — search and add parts.</div>}

        {lines.map((line) => (
          <div key={line.controlPartId} style={{ display: "flex", flexDirection: "column", gap: 8, borderBottom: "1px solid var(--line)", paddingBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{line.name}</div>
                <div className="muted" style={{ fontSize: 11 }}>{line.partNumber}</div>
              </div>
              <button type="button" onClick={() => removeLine(line.controlPartId)} style={{ border: "none", background: "transparent", color: "var(--ink-300)", cursor: "pointer", fontSize: 13, minHeight: 44, minWidth: 44 }}>
                Remove
              </button>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <label className="muted" style={{ fontSize: 11 }}>
                Qty
                <input type="number" min={1} value={line.quantity} onChange={(e) => updateLine(line.controlPartId, { quantity: Math.max(1, Number(e.target.value)) })} style={{ width: 56, marginLeft: 6, padding: 6 }} />
              </label>
              <label className="muted" style={{ fontSize: 11 }}>
                Unit cost (Rs)
                <input type="number" min={0} value={line.unitCost || ""} onChange={(e) => updateLine(line.controlPartId, { unitCost: Math.max(0, Number(e.target.value)) })} style={{ width: 90, marginLeft: 6, padding: 6 }} />
              </label>
            </div>
          </div>
        ))}

        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 18, marginTop: 4 }}>
          <span>Total</span>
          <span>Rs {total.toFixed(2)}</span>
        </div>

        {error && <div className="error-text">{error}</div>}

        <button type="button" className="btn-primary" disabled={lines.length === 0 || !partyId || saving} onClick={handleCreate}>
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
