import type { PurchaseDocumentDetail } from "./api.js";

const TITLES: Record<string, string> = {
  purchase_order: "PURCHASE ORDER",
  goods_receipt: "GOODS RECEIPT NOTE",
  purchase_invoice: "PURCHASE INVOICE",
  supplier_return: "SUPPLIER RETURN NOTE",
};

/**
 * Printable output for the purchase document chain (Purchase Order/Goods
 * Receipt/Purchase Invoice/Supplier Return — CLAUDE.md section 7), built
 * 2026-09-15 as the purchasing-side counterpart to
 * `PrintSalesDocumentView.tsx`. Same mechanism: renders as a normal
 * on-screen overlay, relies on the browser's own Print dialog (styles.css's
 * `@media print` rule, shared with the sales version) — no PDF library.
 *
 * Simpler than the sales side on purpose: the client's notes never ask
 * for a print format for these documents (CLAUDE.md 5.9/5.10 are explicit
 * about Quotation/DN/Invoice specifically), so there's no confirmed
 * format-variant toggle to build here — one plain layout per document
 * type, no KA/KT-price toggle, no Invoice/Bill title switch.
 */
export function PrintPurchaseDocumentView({ doc, onClose }: { doc: PurchaseDocumentDetail; onClose: () => void }) {
  const title = TITLES[doc.documentType] ?? doc.documentType.toUpperCase();
  const balanceDue = (Number(doc.totalAmount) - Number(doc.amountPaid)).toFixed(2);

  return (
    <div className="print-area" style={{ position: "fixed", inset: 0, background: "white", zIndex: 100, overflowY: "auto" }}>
      <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", padding: "14px 24px", borderBottom: "1px solid var(--line)", position: "sticky", top: 0, background: "white" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn-primary" style={{ padding: "8px 20px" }} onClick={() => window.print()}>
            Print
          </button>
          <button type="button" onClick={onClose} style={{ padding: "8px 16px", borderRadius: 10, border: "1px solid var(--line)", background: "white", cursor: "pointer" }}>
            Close
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 24px", fontFamily: "Manrope, sans-serif", color: "black" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid black", paddingBottom: 14, marginBottom: 18 }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <img src="/kt-logo.png" alt="Kiyan Traders" style={{ height: 40 }} />
            <img src="/ka-logo.png" alt="Kiyani Auto Toyota" style={{ height: 40 }} />
          </div>
          <div style={{ textTransform: "uppercase", fontWeight: 800, fontSize: 20, letterSpacing: 1 }}>{title}</div>
        </div>

        <div style={{ fontSize: 12, marginBottom: 18, lineHeight: 1.5 }}>
          <div>Kiyani Auto Market, Gawalmandi Road, Rawalpindi</div>
          <div>051-5552489 / 5530887 &middot; 0339-4007532 &middot; kiyantraderstoyotta@gmail.com</div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 18, gap: 24 }}>
          <div>
            <div style={{ textTransform: "uppercase", fontWeight: 800, fontSize: 10.5, letterSpacing: 0.5, marginBottom: 4 }}>Supplier</div>
            <div style={{ fontWeight: 700 }}>{doc.partyPrintName ?? doc.partyName}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div>
              <span className="muted">Document No: </span>
              <strong>{doc.documentNumber}</strong>
            </div>
            <div>
              <span className="muted">Date: </span>
              {doc.documentDate}
            </div>
            <div>
              <span className="muted">Entity: </span>
              {doc.entityName}
            </div>
            {doc.supplierRef && (
              <div>
                <span className="muted">Supplier Ref: </span>
                {doc.supplierRef}
              </div>
            )}
            {doc.sourceGoodsReceipts.length > 0 && (
              <div>
                <span className="muted">Raised From: </span>
                {doc.sourceGoodsReceipts.join(", ")}
              </div>
            )}
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid black", textTransform: "uppercase", fontSize: 10.5, letterSpacing: 0.3 }}>
              <th style={{ textAlign: "left", padding: "6px 4px" }}>Sr</th>
              <th style={{ textAlign: "left", padding: "6px 4px" }}>Description</th>
              <th style={{ textAlign: "left", padding: "6px 4px" }}>Part No</th>
              <th style={{ textAlign: "right", padding: "6px 4px" }}>Qty</th>
              <th style={{ textAlign: "right", padding: "6px 4px" }}>Unit Cost</th>
              <th style={{ textAlign: "right", padding: "6px 4px" }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((line) => (
              <tr key={line.lineNumber} style={{ borderBottom: "1px solid var(--line)" }}>
                <td style={{ padding: "8px 4px" }}>{line.lineNumber}</td>
                <td style={{ padding: "8px 4px" }}>{line.catalogName}</td>
                <td style={{ padding: "8px 4px" }}>{line.partNumber}</td>
                <td style={{ textAlign: "right", padding: "8px 4px" }}>{line.quantity}</td>
                <td style={{ textAlign: "right", padding: "8px 4px" }}>{line.unitCost}</td>
                <td style={{ textAlign: "right", padding: "8px 4px" }}>{line.lineAmount}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, marginTop: 16, fontSize: 13 }}>
          <div style={{ display: "flex", justifyContent: "space-between", width: 220, fontWeight: 800, fontSize: 15, borderTop: "2px solid black", paddingTop: 6 }}>
            <span style={{ textTransform: "uppercase" }}>Total</span>
            <span>Rs {doc.totalAmount}</span>
          </div>
          {doc.documentType === "purchase_invoice" && Number(doc.amountPaid) > 0 && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", width: 220 }}>
                <span>Amount Paid</span>
                <span>Rs {doc.amountPaid}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", width: 220, fontWeight: 700 }}>
                <span>Balance Due</span>
                <span>Rs {balanceDue}</span>
              </div>
            </>
          )}
        </div>

        <div style={{ marginTop: 40, fontSize: 11, color: "#555" }}>
          {doc.documentType === "purchase_order" && "This purchase order is informational only and carries no accounting effect."}
        </div>
      </div>
    </div>
  );
}
