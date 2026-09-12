import { useEffect, useState } from "react";
import {
  createSettlement,
  deleteSettlement,
  getSalesDocument,
  getSalesHistory,
  postSalesDocument,
  unpostSalesDocument,
  SETTLEMENT_CHANNEL_LABELS,
  type SalesDocumentDetail,
  type SalesDocumentSummary,
  type SettlementChannel,
} from "./api.js";

const STATUS_COLORS: Record<string, string> = {
  draft: "var(--ink-500)",
  posted: "oklch(45% 0.13 150)",
  unposted: "oklch(55% 0.18 25)",
};

/**
 * Opened via the Ctrl+H shortcut (App.tsx) or the nav tab — the first way
 * to see a sale again after checkout creates it. Everything shown here is
 * real: no invoice has ever been visible outside a direct SQL query before
 * this screen existed.
 */
export function SalesHistoryView() {
  const [rows, setRows] = useState<SalesDocumentSummary[]>([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<SalesDocumentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [payChannel, setPayChannel] = useState<SettlementChannel>("cash");
  const [payAmount, setPayAmount] = useState("");
  const [payRef, setPayRef] = useState("");
  const [paySaving, setPaySaving] = useState(false);

  function load(query?: string) {
    getSalesHistory(query ? { q: query } : undefined)
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load sales history"));
  }

  useEffect(() => load(), []);

  async function openDetail(id: string) {
    try {
      setSelected(await getSalesDocument(id));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load sale");
    }
  }

  async function handlePost() {
    if (!selected) return;
    try {
      await postSalesDocument(selected.id);
      await openDetail(selected.id);
      load(q);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not post document");
    }
  }

  async function handleUnpost() {
    if (!selected) return;
    try {
      await unpostSalesDocument(selected.id);
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
        salesDocumentId: selected.id,
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
        <div style={{ fontWeight: 700, fontSize: 16 }}>Sales history</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load(q)}
            placeholder="Search invoice number or customer..."
            style={{ flex: 1, padding: "10px 14px", fontSize: 14, borderRadius: 12, border: "1px solid var(--line)", background: "white" }}
          />
          <button type="button" className="btn-primary" style={{ padding: "0 20px" }} onClick={() => load(q)}>
            Search
          </button>
        </div>
        {error && <div className="error-text">{error}</div>}
        {rows.length === 0 && <div className="muted" style={{ fontSize: 13 }}>No sales found.</div>}
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
                {r.entityName} &middot; {r.partyName ?? "Walk-in customer"} &middot; {r.documentDate}
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
                {selected.entityName} &middot; {selected.partyName ?? "Walk-in customer"} &middot; {selected.documentDate}
              </div>
            </div>
            <button type="button" onClick={() => setSelected(null)} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 18, minHeight: 44, minWidth: 44 }}>
              &times;
            </button>
          </div>

          {selected.documentType !== "quotation" && (
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              {(selected.status === "draft" || selected.status === "unposted") && (
                <button type="button" className="btn-primary" style={{ flex: 1, padding: "10px 0", fontSize: 13 }} onClick={handlePost}>
                  Post
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
                  <div style={{ fontWeight: 700 }}>{line.displayName ?? line.catalogName}</div>
                  <div className="muted" style={{ fontSize: 11 }}>
                    {line.partNumber ?? "Deal part"} &middot; {line.quantity} &times; Rs {line.unitGrossPrice}
                  </div>
                </div>
                <div style={{ fontWeight: 700 }}>Rs {line.lineGrossAmount}</div>
              </div>
            ))}
          </div>

          {selected.discounts.length > 0 && (
            <div style={{ marginTop: 12 }}>
              {selected.discounts.map((d, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span>{d.label}</span>
                  <span style={{ color: "var(--accent)", fontWeight: 700 }}>-Rs {d.amount}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 18 }}>
            <span>Total</span>
            <span>Rs {selected.totalAmount}</span>
          </div>

          {selected.status === "posted" && selected.documentType !== "quotation" && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                <span className="muted">Cost of goods sold (LIFO)</span>
                <span>Rs {selected.cogsAmount}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                <span className="muted">Gross margin</span>
                <span style={{ fontWeight: 700 }}>Rs {(Number(selected.totalAmount) - Number(selected.cogsAmount)).toFixed(2)}</span>
              </div>
            </div>
          )}

          {selected.status === "posted" && selected.documentType === "invoice" && (
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
