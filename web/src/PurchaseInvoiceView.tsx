import { useEffect, useState } from "react";
import {
  createPurchaseInvoice,
  getEntities,
  getPurchaseDocument,
  getPurchaseHistory,
  type LegalEntity,
  type PurchaseDocumentDetail,
  type PurchaseDocumentResult,
  type PurchaseDocumentSummary,
} from "./api.js";

/**
 * First real Purchase Invoice creation — the supplier's actual bill
 * arriving, reconciled against a Goods Receipt already posted (CLAUDE.md
 * section 7: "reconciled later when the actual invoice arrives"). Costs
 * default to whatever was entered on the receipt but are editable here,
 * since the real invoice price can differ from an estimated receiving
 * price.
 *
 * First pass only supports ONE source receipt per invoice — see
 * purchase-documents.ts's header comment for why merging several isn't
 * built yet (handover doc 6.3 asks for it; this is a deliberate scope
 * trim, not an oversight).
 */
export function PurchaseInvoiceView() {
  const [entities, setEntities] = useState<LegalEntity[] | null>(null);
  const [entityId, setEntityId] = useState<string>("");
  const [receipts, setReceipts] = useState<PurchaseDocumentSummary[]>([]);
  const [sourceId, setSourceId] = useState<string>("");
  const [sourceDetail, setSourceDetail] = useState<PurchaseDocumentDetail | null>(null);
  const [costs, setCosts] = useState<Record<number, number>>({});
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
      const initial: Record<number, number> = {};
      detail.lines.forEach((l) => {
        initial[l.lineNumber] = Number(l.unitCost);
      });
      setCosts(initial);
    });
  }, [sourceId]);

  const total = sourceDetail
    ? sourceDetail.lines.reduce((sum, l) => sum + l.quantity * (costs[l.lineNumber] ?? Number(l.unitCost)), 0)
    : 0;

  async function handleCreate() {
    if (!entityId || !sourceDetail) return;
    setSaving(true);
    setError(null);
    try {
      const created = await createPurchaseInvoice({
        legalEntityId: entityId,
        partyId: sourceDetail.partyId,
        supplierRef: supplierRef.trim() || undefined,
        sourceGoodsReceiptId: sourceDetail.id,
        lines: sourceDetail.lines.map((l) => ({
          controlPartId: l.controlPartId,
          quantity: l.quantity,
          unitCost: costs[l.lineNumber] ?? Number(l.unitCost),
        })),
      });
      setResult(created);
      setSourceId("");
      setSourceDetail(null);
      setSupplierRef("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create purchase invoice");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ flex: 1, display: "flex", gap: 20, padding: 24, overflow: "hidden" }}>
      <div style={{ flex: 1.4, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>New purchase invoice</div>

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
          <input placeholder="Supplier's invoice number" value={supplierRef} onChange={(e) => setSupplierRef(e.target.value)} style={{ padding: 8, fontSize: 12.5 }} />
        </div>

        {sourceDetail && (
          <div className="glass-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Billed lines — confirm or correct the cost</div>
            {sourceDetail.lines.map((l) => (
              <div key={l.lineNumber} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                <span style={{ flex: 1 }}>{l.catalogName} <span className="muted">({l.partNumber})</span></span>
                <span className="muted">{l.quantity} &times;</span>
                <input
                  type="number"
                  min={0}
                  value={costs[l.lineNumber] ?? ""}
                  onChange={(e) => setCosts((prev) => ({ ...prev, [l.lineNumber]: Math.max(0, Number(e.target.value)) }))}
                  style={{ width: 90, padding: 6 }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="glass-card" style={{ width: 380, flexShrink: 0, display: "flex", flexDirection: "column", padding: 20, gap: 14, overflowY: "auto" }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>Invoice summary</div>

        {!sourceDetail && <div className="muted" style={{ fontSize: 13 }}>Select a posted goods receipt to bill.</div>}

        {sourceDetail?.lines.map((l) => (
          <div key={l.lineNumber} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, borderBottom: "1px solid var(--line)", paddingBottom: 8 }}>
            <span>{l.catalogName} &times; {l.quantity}</span>
            <span style={{ fontWeight: 700 }}>Rs {(l.quantity * (costs[l.lineNumber] ?? Number(l.unitCost))).toFixed(2)}</span>
          </div>
        ))}

        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 18, marginTop: 4 }}>
          <span>Total</span>
          <span>Rs {total.toFixed(2)}</span>
        </div>

        {error && <div className="error-text">{error}</div>}

        <button type="button" className="btn-primary" disabled={!sourceDetail || saving} onClick={handleCreate}>
          {saving ? "Saving..." : "Create purchase invoice"}
        </button>

        {result && (
          <div style={{ background: "oklch(95% 0.05 150)", borderRadius: 12, padding: 12, fontSize: 13 }}>
            Purchase invoice saved — <strong>{result.documentNumber}</strong>, total Rs {result.totalAmount}
          </div>
        )}
      </div>
    </div>
  );
}
