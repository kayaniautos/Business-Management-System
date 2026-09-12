import { useEffect, useState } from "react";
import {
  createSettlement,
  deleteSettlement,
  getPurchaseDocument,
  getPurchaseHistory,
  postPurchaseDocument,
  unpostPurchaseDocument,
  SETTLEMENT_CHANNEL_LABELS,
  type PurchaseDocumentDetail,
  type PurchaseDocumentSummary,
  type SettlementChannel,
} from "./api.js";

const STATUS_COLORS: Record<string, string> = {
  draft: "var(--ink-500)",
  posted: "oklch(45% 0.13 150)",
  unposted: "oklch(55% 0.18 25)",
};

const TYPE_LABELS: Record<string, string> = {
  purchase_order: "Purchase Order",
  goods_receipt: "Goods Receipt",
  purchase_invoice: "Purchase Invoice",
  supplier_return: "Supplier Return",
};

/**
 * First real way to see the purchase document chain again after creation —
 * the purchasing-side counterpart to Sales History. Post/Unpost shows for a
 * Goods Receipt or a Supplier Return (CLAUDE.md section 7) — the two
 * document types with a real, reversible stock effect; a Purchase Order is
 * informational and a Purchase Invoice is already finalized at creation —
 * see purchases.ts's own comment for why both are blocked server-side too.
 */
export function PurchaseHistoryView() {
  const [rows, setRows] = useState<PurchaseDocumentSummary[]>([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<PurchaseDocumentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [payChannel, setPayChannel] = useState<SettlementChannel>("cash");
  const [payAmount, setPayAmount] = useState("");
  const [payRef, setPayRef] = useState("");
  const [paySaving, setPaySaving] = useState(false);

  function load(query?: string) {
    getPurchaseHistory(query ? { q: query } : undefined)
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load purchase history"));
  }

  useEffect(() => load(), []);

  async function openDetail(id: string) {
    try {
      setSelected(await getPurchaseDocument(id));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load document");
    }
  }

  async function handlePost() {
    if (!selected) return;
    try {
      await postPurchaseDocument(selected.id);
      await openDetail(selected.id);
      load(q);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not post document");
    }
  }

  async function handleUnpost() {
    if (!selected) return;
    try {
      await unpostPurchaseDocument(selected.id);
      await openDetail(selected.id);
      load(q);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not unpost document");
    }
  }

  async function handleRecordPayment() {
    if (!selected || !payAmount || Number(payAmount) <= 0) return;
    setPaySaving(true);
    setError(null);
    try {
      await createSettlement({
        purchaseDocumentId: selected.id,
        channel: payChannel,
        amount: Number(payAmount),
        referenceNote: payRef.trim() || undefined,
      });
      setPayAmount("");
      setPayRef("");
      await openDetail(selected.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record payment");
    } finally {
      setPaySaving(false);
    }
  }

  async function handleDeletePayment(id: string) {
    if (!selected) return;
    try {
      await deleteSettlement(id);
      await openDetail(selected.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove payment");
    }
  }

  return (
    <div style={{ flex: 1, display: "flex", gap: 20, padding: 24, overflow: "hidden" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>Purchase history</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load(q)}
            placeholder="Search document number or supplier..."
            style={{ flex: 1, padding: "10px 14px", fontSize: 14, borderRadius: 12, border: "1px solid var(--line)", background: "white" }}
          />
          <button type="button" className="btn-primary" style={{ padding: "0 20px" }} onClick={() => load(q)}>
            Search
          </button>
        </div>
        {error && <div className="error-text">{error}</div>}
        {rows.length === 0 && <div className="muted" style={{ fontSize: 13 }}>No purchases found.</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => openDetail(r.id)}
              className="glass-card"
              style={{ textAlign: "left", padding: 14, cursor: "pointer", border: "none", font: "inherit" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "Sora, sans-serif", fontWeight: 800, fontSize: 13.5 }}>{r.documentNumber}</span>
                <span style={{ fontWeight: 800, fontSize: 14 }}>Rs {r.totalAmount}</span>
              </div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                {TYPE_LABELS[r.documentType] ?? r.documentType} &middot; {r.entityName} &middot; {r.partyName} &middot; {r.documentDate}
                {" · "}
                <span style={{ color: STATUS_COLORS[r.status] ?? "inherit", fontWeight: 700 }}>{r.status}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {selected && (
        <div className="glass-card" style={{ width: 360, flexShrink: 0, padding: 20, overflowY: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: "Sora, sans-serif", fontWeight: 800, fontSize: 16 }}>{selected.documentNumber}</span>
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: 0.3,
                    color: STATUS_COLORS[selected.status] ?? "inherit",
                    border: `1px solid ${STATUS_COLORS[selected.status] ?? "var(--line)"}`,
                    borderRadius: 6,
                    padding: "2px 6px",
                  }}
                >
                  {selected.status}
                </span>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                {TYPE_LABELS[selected.documentType] ?? selected.documentType} &middot; {selected.entityName} &middot; {selected.partyName} &middot; {selected.documentDate}
              </div>
              {selected.supplierRef && (
                <div className="muted" style={{ fontSize: 11.5 }}>Supplier ref: {selected.supplierRef}</div>
              )}
            </div>
            <button type="button" onClick={() => setSelected(null)} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 18, minHeight: 44, minWidth: 44 }}>
              &times;
            </button>
          </div>

          {(selected.documentType === "goods_receipt" || selected.documentType === "supplier_return") && (
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              {(selected.status === "draft" || selected.status === "unposted") && (
                <button type="button" className="btn-primary" style={{ flex: 1, padding: "10px 0", fontSize: 13 }} onClick={handlePost}>
                  {selected.documentType === "supplier_return" ? "Post (take stock out)" : "Post (bring stock in)"}
                </button>
              )}
              {selected.status === "posted" && (
                <button
                  type="button"
                  style={{
                    flex: 1,
                    padding: "10px 0",
                    fontSize: 13,
                    borderRadius: 10,
                    border: "1px solid var(--line)",
                    background: "white",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                  onClick={handleUnpost}
                >
                  Unpost
                </button>
              )}
            </div>
          )}

          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            {selected.lines.map((line) => (
              <div key={line.lineNumber} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, borderBottom: "1px solid var(--line)", paddingBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{line.catalogName}</div>
                  <div className="muted" style={{ fontSize: 11 }}>
                    {line.partNumber} &middot; {line.quantity} &times; Rs {line.unitCost}
                  </div>
                </div>
                <div style={{ fontWeight: 700 }}>Rs {line.lineAmount}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 18 }}>
            <span>Total</span>
            <span>Rs {selected.totalAmount}</span>
          </div>

          {selected.status === "posted" && selected.documentType === "purchase_invoice" && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                <span className="muted">Amount paid</span>
                <span style={{ fontWeight: 700 }}>Rs {selected.amountPaid}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                <span className="muted">Balance due</span>
                <span style={{ fontWeight: 700 }}>Rs {(Number(selected.totalAmount) - Number(selected.amountPaid)).toFixed(2)}</span>
              </div>

              {selected.settlements.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {selected.settlements.map((s) => (
                    <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
                      <span className="muted">
                        {SETTLEMENT_CHANNEL_LABELS[s.channel]} &middot; {s.paymentDate}{s.referenceNote ? ` · ${s.referenceNote}` : ""}
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 700 }}>Rs {s.amount}</span>
                        <button type="button" onClick={() => handleDeletePayment(s.id)} style={{ border: "none", background: "none", color: "var(--ink-300)", cursor: "pointer", fontSize: 14 }}>
                          &times;
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                <div style={{ display: "flex", gap: 6 }}>
                  <select value={payChannel} onChange={(e) => setPayChannel(e.target.value as SettlementChannel)} style={{ flex: 1, minWidth: 0, padding: 6, fontSize: 12 }}>
                    {(Object.keys(SETTLEMENT_CHANNEL_LABELS) as SettlementChannel[]).map((c) => (
                      <option key={c} value={c}>{SETTLEMENT_CHANNEL_LABELS[c]}</option>
                    ))}
                  </select>
                  <input placeholder="Amount" type="number" min={0} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} style={{ width: 90, minWidth: 0, padding: 6, fontSize: 12 }} />
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input placeholder="Reference (optional)" value={payRef} onChange={(e) => setPayRef(e.target.value)} style={{ flex: 1, minWidth: 0, padding: 6, fontSize: 12 }} />
                  <button type="button" className="btn-primary" disabled={paySaving || !payAmount} onClick={handleRecordPayment} style={{ flexShrink: 0, padding: "0 14px", fontSize: 12 }}>
                    {paySaving ? "..." : "Add"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
