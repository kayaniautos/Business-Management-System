import { useEffect, useState } from "react";
import {
  createPurchaseInvoice,
  getEntities,
  getParties,
  getPurchaseDocument,
  getUninvoicedGoodsReceipts,
  type LegalEntity,
  type Party,
  type PurchaseDocumentDetail,
  type PurchaseDocumentResult,
  type UninvoicedGoodsReceipt,
} from "./api.js";

/**
 * Purchase Invoice creation — the supplier's actual bill arriving,
 * reconciled against one or more already-posted Goods Receipts (CLAUDE.md
 * section 7: "reconciled later when the actual invoice arrives"; handover
 * doc 6.3: "an invoice can be raised from one challan or several
 * combined" — built 2026-09-13, mirroring the sales side's Invoice-from-
 * Delivery-Note(s)).
 *
 * Costs default to whatever each receipt recorded but stay editable per
 * line, since the real invoice price can differ from an estimated
 * receiving price. Unlike the sales side, lines from different receipts
 * are NOT merged even when they're the same part — nothing in the
 * handover doc asks for that here, only for combining several receipts'
 * bills onto one invoice.
 */
export function PurchaseInvoiceView() {
  const [entities, setEntities] = useState<LegalEntity[] | null>(null);
  const [entityId, setEntityId] = useState<string>("");
  const [suppliers, setSuppliers] = useState<Party[]>([]);
  const [partyId, setPartyId] = useState<string>("");

  const [receipts, setReceipts] = useState<UninvoicedGoodsReceipt[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [receiptDetails, setReceiptDetails] = useState<Record<string, PurchaseDocumentDetail>>({});
  // Keyed by `${receiptId}:${lineNumber}`, since lineNumber alone isn't
  // unique once lines from several receipts are combined.
  const [costs, setCosts] = useState<Record<string, number>>({});

  const [supplierRef, setSupplierRef] = useState("");
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
    setSelectedIds([]);
    setReceiptDetails({});
    setCosts({});
    if (!entityId || !partyId) {
      setReceipts([]);
      return;
    }
    getUninvoicedGoodsReceipts({ legalEntityId: entityId, partyId }).then(setReceipts).catch(() => setReceipts([]));
  }, [entityId, partyId]);

  function toggleReceipt(id: string, checked: boolean) {
    setSelectedIds((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
    if (checked && !receiptDetails[id]) {
      getPurchaseDocument(id).then((detail) => {
        setReceiptDetails((prev) => ({ ...prev, [id]: detail }));
        setCosts((prev) => {
          const next = { ...prev };
          detail.lines.forEach((l) => {
            next[`${id}:${l.lineNumber}`] = Number(l.unitCost);
          });
          return next;
        });
      });
    }
  }

  const selectedDetails = selectedIds.map((id) => receiptDetails[id]).filter((d): d is PurchaseDocumentDetail => Boolean(d));

  const total = selectedDetails.reduce(
    (sum, detail) =>
      sum + detail.lines.reduce((s, l) => s + l.quantity * (costs[`${detail.id}:${l.lineNumber}`] ?? Number(l.unitCost)), 0),
    0,
  );

  async function handleCreate() {
    if (!entityId || !partyId || selectedDetails.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const lines = selectedDetails.flatMap((detail) =>
        detail.lines.map((l) => ({
          controlPartId: l.controlPartId,
          quantity: l.quantity,
          unitCost: costs[`${detail.id}:${l.lineNumber}`] ?? Number(l.unitCost),
        })),
      );

      const created = await createPurchaseInvoice({
        legalEntityId: entityId,
        partyId,
        supplierRef: supplierRef.trim() || undefined,
        sourceGoodsReceiptIds: selectedIds,
        lines,
      });
      setResult(created);
      setSelectedIds([]);
      setReceiptDetails({});
      setCosts({});
      setSupplierRef("");
      getUninvoicedGoodsReceipts({ legalEntityId: entityId, partyId }).then(setReceipts).catch(() => {});
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
              <select value={entityId} onChange={(e) => setEntityId(e.target.value)} style={{ padding: 8, borderRadius: 10, border: "1px solid var(--line)", fontSize: 12.5 }}>
                {entities.map((ent) => (
                  <option key={ent.id} value={ent.id}>{ent.name}</option>
                ))}
              </select>
            )}
            <select value={partyId} onChange={(e) => setPartyId(e.target.value)} style={{ padding: 8, borderRadius: 10, border: "1px solid var(--line)", fontSize: 12.5, flex: 1 }}>
              <option value="">Select a supplier...</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <input placeholder="Supplier's invoice number" value={supplierRef} onChange={(e) => setSupplierRef(e.target.value)} style={{ padding: 8, fontSize: 12.5 }} />
        </div>

        {partyId && (
          <div className="glass-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Goods receipts ready to bill</div>
            <div className="muted" style={{ fontSize: 11.5 }}>Only posted receipts not already invoiced show up here — combine as many as belong to one bill.</div>
            {receipts.length === 0 && <div className="muted" style={{ fontSize: 13 }}>None for this entity/supplier right now.</div>}
            {receipts.map((r) => (
              <label key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                <input type="checkbox" checked={selectedIds.includes(r.id)} onChange={(e) => toggleReceipt(r.id, e.target.checked)} style={{ width: 20, height: 20 }} />
                <span style={{ flex: 1 }}>{r.documentNumber} <span className="muted">({r.documentDate})</span></span>
                <span style={{ fontWeight: 700 }}>Rs {r.totalAmount}</span>
              </label>
            ))}
          </div>
        )}

        {selectedDetails.map((detail) => (
          <div key={detail.id} className="glass-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{detail.documentNumber} — confirm or correct the cost</div>
            {detail.lines.map((l) => (
              <div key={l.lineNumber} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                <span style={{ flex: 1 }}>{l.catalogName} <span className="muted">({l.partNumber})</span></span>
                <span className="muted">{l.quantity} &times;</span>
                <input
                  type="number"
                  min={0}
                  value={costs[`${detail.id}:${l.lineNumber}`] ?? ""}
                  onChange={(e) =>
                    setCosts((prev) => ({ ...prev, [`${detail.id}:${l.lineNumber}`]: Math.max(0, Number(e.target.value)) }))
                  }
                  style={{ width: 90, padding: 6 }}
                />
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="glass-card" style={{ width: 380, flexShrink: 0, display: "flex", flexDirection: "column", padding: 20, gap: 14, overflowY: "auto" }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>Invoice summary</div>

        {selectedDetails.length === 0 && <div className="muted" style={{ fontSize: 13 }}>Select at least one goods receipt to bill.</div>}

        {selectedDetails.map((detail) =>
          detail.lines.map((l) => (
            <div key={`${detail.id}:${l.lineNumber}`} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, borderBottom: "1px solid var(--line)", paddingBottom: 8 }}>
              <span>{l.catalogName} &times; {l.quantity}</span>
              <span style={{ fontWeight: 700 }}>Rs {(l.quantity * (costs[`${detail.id}:${l.lineNumber}`] ?? Number(l.unitCost))).toFixed(2)}</span>
            </div>
          )),
        )}

        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 18, marginTop: 4 }}>
          <span>Total</span>
          <span>Rs {total.toFixed(2)}</span>
        </div>

        {error && <div className="error-text">{error}</div>}

        <button type="button" className="btn-primary" disabled={selectedDetails.length === 0 || saving} onClick={handleCreate}>
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
