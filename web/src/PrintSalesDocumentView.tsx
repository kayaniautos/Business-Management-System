import { useState } from "react";
import type { SalesDocumentDetail } from "./api.js";

/**
 * Printable output for the sales document chain (CLAUDE.md 5.9/5.10) —
 * until now a Quotation/DN/Invoice could be created and viewed on screen,
 * but nothing actually printed or exported. No PDF library is used: this
 * renders a normal on-screen overlay and relies on the browser's own
 * Print dialog (styles.css's `@media print` rule hides everything else
 * on the page) — "Save as PDF" from that dialog is how a real PDF comes
 * out of this, matching how Electron's own print-to-PDF would work too,
 * without adding a server-side rendering dependency for what's still a
 * browser-dev pass.
 *
 * Confirmed format variants, both applied as print-TIME toggles rather
 * than anything stored on the document (CLAUDE.md 5.10's own
 * `[unclear — confirm]`: "Invoice format" vs "Bill format" read as
 * print-time labeling of the same record, not separate documents):
 * - Delivery Note: "4 format variants (KA/KT × with-price/without-
 *   price)". KA/KT is just `doc.entityName`, already resolved — only
 *   the price/no-price axis needs a toggle here.
 * - Invoice: "Invoice format / Bill format for sales tax" — a label/
 *   title toggle only, identical content and totals either way, since
 *   nothing in the spec suggests a different stock/accounting effect
 *   between the two.
 *
 * `[unclear — confirm]` CAPS language (CLAUDE.md 5.9: "scope
 * unconfirmed... likely printed documents") is applied here to the
 * document title and section labels (BILL TO, TOTAL, etc.) as the most
 * plausible reading of that note, not a confirmed client requirement.
 *
 * Deliberately scoped to the sales document chain only — CLAUDE.md 5.9/
 * 5.10 are explicit about print formats for Quotation/DN/Invoice; the
 * client's notes never mention print formats for Purchase Orders/Goods
 * Receipts/Purchase Invoices, so those aren't built here.
 */
export function PrintSalesDocumentView({ doc, onClose }: { doc: SalesDocumentDetail; onClose: () => void }) {
  const [showPrices, setShowPrices] = useState(true);
  const [invoiceFormat, setInvoiceFormat] = useState<"invoice" | "bill">("invoice");

  const title =
    doc.documentType === "quotation"
      ? "QUOTATION"
      : doc.documentType === "delivery_note"
        ? "DELIVERY NOTE"
        : invoiceFormat === "invoice"
          ? "SALES TAX INVOICE"
          : "BILL";

  // DN price/no-price toggle only — Quotation/Invoice always show prices,
  // since neither has a confirmed no-price variant.
  const pricesVisible = doc.documentType === "delivery_note" ? showPrices : true;
  const balanceDue = (Number(doc.totalAmount) - Number(doc.amountPaid)).toFixed(2);

  return (
    <div className="print-area" style={{ position: "fixed", inset: 0, background: "white", zIndex: 100, overflowY: "auto" }}>
      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 24px", borderBottom: "1px solid var(--line)", position: "sticky", top: 0, background: "white" }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          {doc.documentType === "delivery_note" && (
            <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={showPrices} onChange={(e) => setShowPrices(e.target.checked)} />
              Show prices
            </label>
          )}
          {doc.documentType === "invoice" && (
            <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
              Format
              <select value={invoiceFormat} onChange={(e) => setInvoiceFormat(e.target.value as "invoice" | "bill")} style={{ padding: 6 }}>
                <option value="invoice">Sales Tax Invoice</option>
                <option value="bill">Bill</option>
              </select>
            </label>
          )}
        </div>
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
            <div style={{ textTransform: "uppercase", fontWeight: 800, fontSize: 10.5, letterSpacing: 0.5, marginBottom: 4 }}>Bill To</div>
            <div style={{ fontWeight: 700 }}>{doc.partyPrintName ?? "Walk-in customer"}</div>
            {doc.customerGstNo && <div>GST: {doc.customerGstNo}</div>}
            {doc.customerNtnNo && <div>NTN: {doc.customerNtnNo}</div>}
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
            {doc.customerRef && (
              <div>
                <span className="muted">Customer Ref: </span>
                {doc.customerRef}
              </div>
            )}
            {doc.ourRefNo && (
              <div>
                <span className="muted">Our Ref: </span>
                {doc.ourRefNo}
              </div>
            )}
            {doc.poNo && (
              <div>
                <span className="muted">P.O. No: </span>
                {doc.poNo}
              </div>
            )}
            {doc.validUntil && (
              <div>
                <span className="muted">Valid Until: </span>
                {doc.validUntil}
              </div>
            )}
          </div>
        </div>

        {doc.vehicleDetails && (
          <div style={{ fontSize: 13, marginBottom: 18 }}>
            <span className="muted">Vehicle Details: </span>
            {doc.vehicleDetails}
          </div>
        )}

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid black", textTransform: "uppercase", fontSize: 10.5, letterSpacing: 0.3 }}>
              <th style={{ textAlign: "left", padding: "6px 4px" }}>Sr</th>
              <th style={{ textAlign: "left", padding: "6px 4px" }}>Description</th>
              <th style={{ textAlign: "left", padding: "6px 4px" }}>Part No</th>
              <th style={{ textAlign: "right", padding: "6px 4px" }}>Qty</th>
              {pricesVisible && (
                <>
                  <th style={{ textAlign: "right", padding: "6px 4px" }}>Unit Price</th>
                  <th style={{ textAlign: "right", padding: "6px 4px" }}>Amount</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((line) => (
              <tr key={line.lineNumber} style={{ borderBottom: "1px solid var(--line)" }}>
                <td style={{ padding: "8px 4px" }}>{line.lineNumber}</td>
                <td style={{ padding: "8px 4px" }}>{line.displayName ?? line.catalogName}</td>
                <td style={{ padding: "8px 4px" }}>{line.partNumber ?? "—"}</td>
                <td style={{ textAlign: "right", padding: "8px 4px" }}>{line.quantity}</td>
                {pricesVisible && (
                  <>
                    <td style={{ textAlign: "right", padding: "8px 4px" }}>{line.unitGrossPrice}</td>
                    <td style={{ textAlign: "right", padding: "8px 4px" }}>{line.lineGrossAmount}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {pricesVisible && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, marginTop: 16, fontSize: 13 }}>
            {doc.discounts.map((d, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", width: 220 }}>
                <span>{d.label}</span>
                <span>-{d.amount}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", width: 220, fontWeight: 800, fontSize: 15, borderTop: "2px solid black", paddingTop: 6 }}>
              <span style={{ textTransform: "uppercase" }}>Total</span>
              <span>Rs {doc.totalAmount}</span>
            </div>
            {doc.documentType === "invoice" && Number(doc.amountPaid) > 0 && (
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
        )}

        <div style={{ marginTop: 40, fontSize: 11, color: "#555" }}>
          {doc.documentType === "quotation" && "This quotation is informational only and carries no accounting effect."}
        </div>
      </div>
    </div>
  );
}
