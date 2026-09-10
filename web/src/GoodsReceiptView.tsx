import { useEffect, useState, type FormEvent } from "react";
import {
  createGoodsReceipt,
  getEntities,
  getParties,
  getPurchaseDocument,
  getPurchaseHistory,
  searchParts,
  type LegalEntity,
  type Party,
  type PartSearchResult,
  type PurchaseDocumentDetail,
  type PurchaseDocumentResult,
  type PurchaseDocumentSummary,
} from "./api.js";

interface GrnLine {
  controlPartId: string;
  partNumber: string;
  name: string;
  quantity: number;
  unitCost: number;
}

/**
 * First real Goods Receipt creation, in two modes per CLAUDE.md section 7
 * / handover doc 6.3: "Prepare directly" (no Purchase Order — goods just
 * showed up) or "From Purchase Order," picking which lines/quantities
 * were actually delivered — partial deliveries against one order are an
 * explicit requirement, so quantities here start at the ordered amount
 * but are editable down.
 */
export function GoodsReceiptView() {
  const [mode, setMode] = useState<"new" | "from-po">("new");
  const [entities, setEntities] = useState<LegalEntity[] | null>(null);
  const [entityId, setEntityId] = useState<string>("");
  const [suppliers, setSuppliers] = useState<Party[]>([]);
  const [partyId, setPartyId] = useState<string>("");
  const [supplierRef, setSupplierRef] = useState("");

  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseDocumentSummary[]>([]);
  const [sourcePoId, setSourcePoId] = useState<string>("");
  const [sourceDetail, setSourceDetail] = useState<PurchaseDocumentDetail | null>(null);
  const [selectedPoLines, setSelectedPoLines] = useState<Record<number, { checked: boolean; quantity: number }>>({});

  const [q, setQ] = useState("");
  const [results, setResults] = useState<PartSearchResult[]>([]);
  const [newLines, setNewLines] = useState<GrnLine[]>([]);
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

  useEffect(() => {
    if (mode !== "from-po" || !entityId) return;
    getPurchaseHistory({ legalEntityId: entityId, documentType: "purchase_order" }).then(setPurchaseOrders).catch(() => {});
  }, [mode, entityId]);

  useEffect(() => {
    if (!sourcePoId) {
      setSourceDetail(null);
      return;
    }
    getPurchaseDocument(sourcePoId).then((detail) => {
      setSourceDetail(detail);
      setPartyId(detail.partyId);
      const initial: Record<number, { checked: boolean; quantity: number }> = {};
      detail.lines.forEach((l) => {
        initial[l.lineNumber] = { checked: false, quantity: l.quantity };
      });
      setSelectedPoLines(initial);
    });
  }, [sourcePoId]);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    try {
      setResults(await searchParts(q));
    } catch {
      setResults([]);
    }
  }

  function addNewLine(part: PartSearchResult) {
    if (part.isDealPart) return;
    setNewLines((prev) => {
      const existing = prev.find((l) => l.controlPartId === part.id);
      if (existing) return prev.map((l) => (l.controlPartId === part.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, { controlPartId: part.id, partNumber: part.partNumber ?? "", name: part.name, quantity: 1, unitCost: 0 }];
    });
  }

  function updateNewLine(controlPartId: string, patch: Partial<GrnLine>) {
    setNewLines((prev) => prev.map((l) => (l.controlPartId === controlPartId ? { ...l, ...patch } : l)));
  }

  function toggleQuoteLine(lineNumber: number, checked: boolean) {
    setSelectedPoLines((prev) => ({ ...prev, [lineNumber]: { ...prev[lineNumber], checked } }));
  }

  function updatePoLineQty(lineNumber: number, quantity: number) {
    setSelectedPoLines((prev) => ({ ...prev, [lineNumber]: { ...prev[lineNumber], quantity } }));
  }

  function resolveLines() {
    if (mode === "new") {
      return newLines.map((l) => ({ controlPartId: l.controlPartId, quantity: l.quantity, unitCost: l.unitCost }));
    }
    if (!sourceDetail) return [];
    return sourceDetail.lines
      .filter((l) => selectedPoLines[l.lineNumber]?.checked)
      .map((l) => ({
        controlPartId: l.controlPartId,
        quantity: selectedPoLines[l.lineNumber].quantity,
        unitCost: Number(l.unitCost),
      }));
  }

  const effectiveLines = resolveLines();
  const total = effectiveLines.reduce((sum, l) => sum + l.quantity * l.unitCost, 0);

  async function handleCreate() {
    if (!entityId || !partyId) return;
    setSaving(true);
    setError(null);
    try {
      if (mode === "from-po" && !sourceDetail) throw new Error("Pick a purchase order first");
      const lines = resolveLines();
      if (lines.length === 0) {
        throw new Error(mode === "new" ? "Add at least one part" : "Select at least one line from the purchase order");
      }

      const created = await createGoodsReceipt({
        legalEntityId: entityId,
        partyId,
        supplierRef: supplierRef.trim() || undefined,
        sourcePurchaseOrderId: mode === "from-po" ? sourcePoId : undefined,
        lines,
      });
      setResult(created);
      setNewLines([]);
      setSupplierRef("");
      setSourcePoId("");
      setSourceDetail(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create goods receipt");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ flex: 1, display: "flex", gap: 20, padding: 24, overflow: "hidden" }}>
      <div style={{ flex: 1.4, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>New goods receipt</div>
          <div style={{ display: "flex", gap: 6 }}>
            {(["new", "from-po"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 10,
                  border: "1px solid var(--line)",
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: "pointer",
                  background: mode === m ? "var(--ink-900)" : "white",
                  color: mode === m ? "white" : "var(--ink-700)",
                }}
              >
                {m === "new" ? "Prepare directly" : "From Purchase Order"}
              </button>
            ))}
          </div>
        </div>

        <div className="glass-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {entities && (
              <select value={entityId} onChange={(e) => setEntityId(e.target.value)} style={{ padding: 8, borderRadius: 10, border: "1px solid var(--line)", fontSize: 12.5 }}>
                {entities.map((ent) => (
                  <option key={ent.id} value={ent.id}>{ent.name}</option>
                ))}
              </select>
            )}
            <select value={partyId} onChange={(e) => setPartyId(e.target.value)} disabled={mode === "from-po"} style={{ padding: 8, borderRadius: 10, border: "1px solid var(--line)", fontSize: 12.5 }}>
              <option value="">Select supplier...</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {mode === "from-po" && (
            <select value={sourcePoId} onChange={(e) => setSourcePoId(e.target.value)} style={{ padding: 8, borderRadius: 10, border: "1px solid var(--line)", fontSize: 12.5 }}>
              <option value="">Select a purchase order...</option>
              {purchaseOrders.map((po) => (
                <option key={po.id} value={po.id}>{po.documentNumber} — {po.partyName} — Rs {po.totalAmount}</option>
              ))}
            </select>
          )}

          <input placeholder="Supplier's delivery challan no." value={supplierRef} onChange={(e) => setSupplierRef(e.target.value)} style={{ padding: 8, fontSize: 12.5 }} />
        </div>

        {mode === "new" ? (
          <>
            <form onSubmit={handleSearch} style={{ display: "flex", gap: 10 }}>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search part number or name..." style={{ flex: 1, padding: "14px 16px", fontSize: 15, borderRadius: 14, border: "1px solid var(--line)", background: "white" }} />
              <button type="submit" className="btn-primary" style={{ padding: "0 26px" }}>Search</button>
            </form>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
              {results.filter((part) => !part.isDealPart).map((part) => (
                <div key={part.id} className="glass-card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{part.name}</div>
                  <div className="muted" style={{ fontSize: 11 }}>{part.partNumber}</div>
                  <button type="button" className="btn-primary" onClick={() => addNewLine(part)}>Add</button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="glass-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Pick lines actually delivered</div>
            {!sourceDetail && <div className="muted" style={{ fontSize: 13 }}>Select a purchase order above.</div>}
            {sourceDetail?.lines.map((l) => (
              <label key={l.lineNumber} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                <input type="checkbox" checked={selectedPoLines[l.lineNumber]?.checked ?? false} onChange={(e) => toggleQuoteLine(l.lineNumber, e.target.checked)} style={{ width: 20, height: 20 }} />
                <span style={{ flex: 1 }}>{l.catalogName} <span className="muted">({l.partNumber})</span></span>
                <input type="number" min={1} max={l.quantity} value={selectedPoLines[l.lineNumber]?.quantity ?? l.quantity} onChange={(e) => updatePoLineQty(l.lineNumber, Math.min(l.quantity, Math.max(1, Number(e.target.value))))} style={{ width: 56, padding: 6 }} />
                <span className="muted">of {l.quantity} ordered</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="glass-card" style={{ width: 380, flexShrink: 0, display: "flex", flexDirection: "column", padding: 20, gap: 14, overflowY: "auto" }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>Received lines</div>

        {mode === "new" &&
          newLines.map((line) => (
            <div key={line.controlPartId} style={{ display: "flex", flexDirection: "column", gap: 8, borderBottom: "1px solid var(--line)", paddingBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{line.name}</div>
              <div className="muted" style={{ fontSize: 11 }}>{line.partNumber}</div>
              <div style={{ display: "flex", gap: 10 }}>
                <label className="muted" style={{ fontSize: 11 }}>
                  Qty
                  <input type="number" min={1} value={line.quantity} onChange={(e) => updateNewLine(line.controlPartId, { quantity: Math.max(1, Number(e.target.value)) })} style={{ width: 56, marginLeft: 6, padding: 6 }} />
                </label>
                <label className="muted" style={{ fontSize: 11 }}>
                  Unit cost (Rs)
                  <input type="number" min={0} value={line.unitCost || ""} onChange={(e) => updateNewLine(line.controlPartId, { unitCost: Math.max(0, Number(e.target.value)) })} style={{ width: 90, marginLeft: 6, padding: 6 }} />
                </label>
              </div>
            </div>
          ))}

        {mode === "from-po" &&
          sourceDetail?.lines
            .filter((l) => selectedPoLines[l.lineNumber]?.checked)
            .map((l) => (
              <div key={l.lineNumber} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, borderBottom: "1px solid var(--line)", paddingBottom: 8 }}>
                <span>{l.catalogName} &times; {selectedPoLines[l.lineNumber].quantity}</span>
                <span style={{ fontWeight: 700 }}>Rs {(selectedPoLines[l.lineNumber].quantity * Number(l.unitCost)).toFixed(2)}</span>
              </div>
            ))}

        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 18, marginTop: 4 }}>
          <span>Total</span>
          <span>Rs {total.toFixed(2)}</span>
        </div>

        {error && <div className="error-text">{error}</div>}

        <button type="button" className="btn-primary" disabled={saving || !partyId} onClick={handleCreate}>
          {saving ? "Saving..." : "Create goods receipt"}
        </button>

        {result && (
          <div style={{ background: "oklch(95% 0.05 150)", borderRadius: 12, padding: 12, fontSize: 13 }}>
            Goods receipt saved — <strong>{result.documentNumber}</strong>, total Rs {result.totalAmount}. Post it from Purchase History to bring the stock in.
          </div>
        )}
      </div>
    </div>
  );
}
