import { useEffect, useState } from "react";
import {
  getPurchaseDocument,
  getPurchaseHistory,
  postPurchaseDocument,
  unpostPurchaseDocument,
  type PurchaseDocumentDetail,
  type PurchaseDocumentSummary,
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
};

/**
 * First real way to see the purchase document chain again after creation —
 * the purchasing-side counterpart to Sales History. Post/Unpost only shows
 * for a Goods Receipt (CLAUDE.md section 7): a Purchase Order is
 * informational and a Purchase Invoice is already finalized at creation —
 * see purchases.ts's own comment for why both are blocked server-side too.
 */
export function PurchaseHistoryView() {
  const [rows, setRows] = useState<PurchaseDocumentSummary[]>([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<PurchaseDocumentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

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

          {selected.documentType === "goods_receipt" && (
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              {(selected.status === "draft" || selected.status === "unposted") && (
                <button type="button" className="btn-primary" style={{ flex: 1, padding: "10px 0", fontSize: 13 }} onClick={handlePost}>
                  Post (bring stock in)
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
        </div>
      )}
    </div>
  );
}
