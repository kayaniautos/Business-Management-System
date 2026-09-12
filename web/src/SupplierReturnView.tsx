import { useEffect, useState } from "react";
import {
  createSupplierReturn,
  getEntities,
  getPurchaseDocument,
  getPurchaseHistory,
  type LegalEntity,
  type PurchaseDocumentDetail,
  type PurchaseDocumentResult,
  type PurchaseDocumentSummary,
} from "./api.js";

/**
 * First real Supplier Return creation (handover doc 6.3: "a ledger entry
 * linked back to the original purchase voucher, not a free-floating
 * credit note"). Always starts from a specific posted Goods Receipt —
 * the "original voucher" — never a blank form, matching the confirmed
 * spec literally. Staff pick which lines and how much of each are being
 * sent back; quantity defaults to what was received but is editable
 * down. The real cap (what's still actually on hand from that exact
 * batch, via its own LIFO cost layer) is enforced server-side —
 * supplier-returns.ts's own error message names the real remaining
 * count if the entered quantity is too high, rather than this screen
 * trying to duplicate that check ahead of time.
 */
export function SupplierReturnView() {
  const [entities, setEntities] = useState<LegalEntity[] | null>(null);
  const [entityId, setEntityId] = useState<string>("");
  const [receipts, setReceipts] = useState<PurchaseDocumentSummary[]>([]);
  const [sourceId, setSourceId] = useState<string>("");
  const [sourceDetail, setSourceDetail] = useState<PurchaseDocumentDetail | null>(null);
  const [selectedLines, setSelectedLines] = useState<Record<number, { checked: boolean; quantity: number }>>({});
  const [supplierRef, setSupplierRef] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<PurchaseDocumentResult | null>(null);

  useEffect(() => {
    getEntities().then((list) => {
      setEntities(list);
      if (list.length > 0) setEntityId(list[0].id);
    });
  }, []);

  useEffect(() => {
    if (!entityId) return;
    getPurchaseHistory({ legalEntityId: entityId, documentType: "goods_receipt" })
      .then((list) => setReceipts(list.filter((r) => r.status === "posted")))
      .catch(() => {});
  }, [entityId]);

  useEffect(() => {
    if (!sourceId) {
      setSourceDetail(null);
      return;
    }
    getPurchaseDocument(sourceId).then((detail) => {
      setSourceDetail(detail);
      const initial: Record<number, { checked: boolean; quantity: number }> = {};
      detail.lines.forEach((l) => {
        initial[l.lineNumber] = { checked: false, quantity: l.quantity };
      });
      setSelectedLines(initial);
    });
  }, [sourceId]);

  function toggleLine(lineNumber: number, checked: boolean) {
    setSelectedLines((prev) => ({ ...prev, [lineNumber]: { ...prev[lineNumber], checked } }));
  }

  function updateLineQty(lineNumber: number, quantity: number) {
    setSelectedLines((prev) => ({ ...prev, [lineNumber]: { ...prev[lineNumber], quantity } }));
  }

  const effectiveLines = sourceDetail
    ? sourceDetail.lines.filter((l) => selectedLines[l.lineNumber]?.checked)
    : [];
  const total = effectiveLines.reduce(
    (sum, l) => sum + selectedLines[l.lineNumber].quantity * Number(l.unitCost),
    0,
  );

  async function handleCreate() {
    if (!entityId || !sourceDetail) return;
    setSaving(true);
    setError(null);
    try {
      const lines = effectiveLines.map((l) => ({
        controlPartId: l.controlPartId,
        quantity: selectedLines[l.lineNumber].quantity,
      }));
      if (lines.length === 0) throw new Error("Select at least one line to return");

      const created = await createSupplierReturn({
        legalEntityId: entityId,
        partyId: sourceDetail.partyId,
        supplierRef: supplierRef.trim() || undefined,
        sourceGoodsReceiptId: sourceDetail.id,
        lines,
      });
      setResult(created);
      setSourceId("");
      setSourceDetail(null);
      setSupplierRef("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create supplier return");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ flex: 1, display: "flex", gap: 20, padding: 24, overflow: "hidden" }}>
      <div style={{ flex: 1.4, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>New supplier return</div>

        <div className="glass-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {entities && (
              <select value={entityId} onChange={(e) => { setEntityId(e.target.value); setSourceId(""); }} style={{ padding: 8, borderRadius: 10, border: "1px solid var(--line)", fontSize: 12.5 }}>
                {entities.map((ent) => (
                  <option key={ent.id} value={ent.id}>{ent.name}</option>
                ))}
              </select>
            )}
            <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} style={{ padding: 8, borderRadius: 10, border: "1px solid var(--line)", fontSize: 12.5, flex: 1 }}>
              <option value="">Select a posted goods receipt...</option>
              {receipts.map((r) => (
                <option key={r.id} value={r.id}>{r.documentNumber} — {r.partyName} — Rs {r.totalAmount}</option>
              ))}
            </select>
          </div>
          {receipts.length === 0 && (
            <div className="muted" style={{ fontSize: 12 }}>No posted goods receipts for this entity yet.</div>
          )}
          <input placeholder="Supplier's credit note number (optional)" value={supplierRef} onChange={(e) => setSupplierRef(e.target.value)} style={{ padding: 8, fontSize: 12.5 }} />
        </div>

        {sourceDetail && (
          <div className="glass-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Pick lines being returned</div>
            {sourceDetail.lines.map((l) => (
              <label key={l.lineNumber} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                <input type="checkbox" checked={selectedLines[l.lineNumber]?.checked ?? false} onChange={(e) => toggleLine(l.lineNumber, e.target.checked)} style={{ width: 20, height: 20 }} />
                <span style={{ flex: 1 }}>{l.catalogName} <span className="muted">({l.partNumber})</span></span>
                <input
                  type="number"
                  min={1}
                  max={l.quantity}
                  value={selectedLines[l.lineNumber]?.quantity ?? l.quantity}
                  onChange={(e) => updateLineQty(l.lineNumber, Math.min(l.quantity, Math.max(1, Number(e.target.value))))}
                  style={{ width: 56, padding: 6 }}
                />
                <span className="muted">of {l.quantity} received</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="glass-card" style={{ width: 380, flexShrink: 0, display: "flex", flexDirection: "column", padding: 20, gap: 14, overflowY: "auto" }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>Return summary</div>

        {!sourceDetail && <div className="muted" style={{ fontSize: 13 }}>Select a posted goods receipt above.</div>}

        {effectiveLines.map((l) => (
          <div key={l.lineNumber} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, borderBottom: "1px solid var(--line)", paddingBottom: 8 }}>
            <span>{l.catalogName} &times; {selectedLines[l.lineNumber].quantity}</span>
            <span style={{ fontWeight: 700 }}>Rs {(selectedLines[l.lineNumber].quantity * Number(l.unitCost)).toFixed(2)}</span>
          </div>
        ))}

        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 18, marginTop: 4 }}>
          <span>Total</span>
          <span>Rs {total.toFixed(2)}</span>
        </div>

        {error && <div className="error-text">{error}</div>}

        <button type="button" className="btn-primary" disabled={!sourceDetail || saving} onClick={handleCreate}>
          {saving ? "Saving..." : "Create supplier return"}
        </button>

        {result && (
          <div style={{ background: "oklch(95% 0.05 150)", borderRadius: 12, padding: 12, fontSize: 13 }}>
            Supplier return saved — <strong>{result.documentNumber}</strong>, total Rs {result.totalAmount}. Post it from Purchase History to take the stock out.
          </div>
        )}
      </div>
    </div>
  );
}
