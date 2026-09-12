import { useEffect, useState } from "react";
import {
  createParty,
  getParties,
  getPartyLedger,
  SETTLEMENT_CHANNEL_LABELS,
  type Party,
  type PartyLedger,
  type PartyLedgerTransaction,
  type PartyNature,
  type PartyStatus,
  type SettlementChannel,
} from "./api.js";

const TXN_TYPE_LABELS: Record<string, string> = {
  quotation: "Quotation",
  delivery_note: "Delivery Note",
  invoice: "Invoice",
  purchase_order: "Purchase Order",
  goods_receipt: "Goods Receipt",
  purchase_invoice: "Purchase Invoice",
};

// A receipt/payment_made row's documentType is a synthetic
// "receipt_<channel>"/"payment_<channel>" string (parties.ts's /ledger
// endpoint) rather than a real document type, since it isn't one — this
// pulls the channel back out to render "Payment received (Cash)" etc.
function describeTransaction(t: PartyLedgerTransaction): string {
  if (t.kind === "receipt" || t.kind === "payment_made") {
    const channel = t.documentType.replace(/^(receipt|payment)_/, "") as SettlementChannel;
    const label = SETTLEMENT_CHANNEL_LABELS[channel] ?? channel;
    return t.kind === "receipt" ? `Payment received (${label})` : `Payment made (${label})`;
  }
  return TXN_TYPE_LABELS[t.documentType] ?? t.documentType;
}

const STATUS_LABELS: Record<PartyStatus, string> = {
  C1: "C1 · Corporate",
  C2: "C2 · Retail-Counter",
  C3: "C3 · Wholesale",
};

const NATURE_LABELS: Record<PartyNature, string> = {
  S1: "S1 · Vendors/Suppliers A/C",
  S2: "S2 · Market Supplier A/C",
  S3: "S3 · Customer Receivable A/C",
};

export function PartyView() {
  const [parties, setParties] = useState<Party[]>([]);
  const [error, setError] = useState<string | null>(null);

  // When set, the right panel shows this party's statement instead of the
  // "New party" form — one panel, two modes, rather than a third column.
  const [ledgerPartyId, setLedgerPartyId] = useState<string | null>(null);
  const [ledger, setLedger] = useState<PartyLedger | null>(null);
  const [ledgerError, setLedgerError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [status, setStatus] = useState<PartyStatus>("C2");
  const [nature, setNature] = useState<PartyNature>("S3");
  const [gstNo, setGstNo] = useState("");
  const [ntnNo, setNtnNo] = useState("");
  const [phones, setPhones] = useState<string[]>([""]);

  function load() {
    getParties().then(setParties).catch((e) => setError(String(e)));
  }

  async function openLedger(partyId: string) {
    setLedgerPartyId(partyId);
    setLedger(null);
    setLedgerError(null);
    try {
      setLedger(await getPartyLedger(partyId));
    } catch (e) {
      setLedgerError(e instanceof Error ? e.message : "Could not load statement");
    }
  }

  function closeLedger() {
    setLedgerPartyId(null);
    setLedger(null);
    setLedgerError(null);
  }

  useEffect(load, []);

  function updatePhone(i: number, value: string) {
    setPhones((prev) => prev.map((p, idx) => (idx === i ? value : p)));
  }

  function addPhoneField() {
    if (phones.length < 5) setPhones((prev) => [...prev, ""]);
  }

  async function handleCreate() {
    const cleanPhones = phones.map((p) => p.trim()).filter(Boolean);
    if (!name.trim() || cleanPhones.length === 0) {
      setError("Name and at least one phone number are required.");
      return;
    }
    try {
      await createParty({
        name: name.trim(),
        status,
        nature,
        gstNo: gstNo.trim() || undefined,
        ntnNo: ntnNo.trim() || undefined,
        phoneNumbers: cleanPhones,
      });
      setName("");
      setGstNo("");
      setNtnNo("");
      setPhones([""]);
      setError(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create party");
    }
  }

  return (
    <div style={{ flex: 1, display: "flex", gap: 20, padding: 24, overflow: "hidden" }}>
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>Customers &amp; vendors</div>
        {error && <div className="error-text">{error}</div>}
        {parties.length === 0 && <div className="muted" style={{ fontSize: 13 }}>No parties yet — add one on the right.</div>}
        {parties.map((p) => (
          <div key={p.id} className="glass-card" style={{ padding: 14, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                {STATUS_LABELS[p.status]} &middot; {NATURE_LABELS[p.nature]}
              </div>
              {(p.gstNo || p.ntnNo) && (
                <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                  {p.gstNo && `GST ${p.gstNo}`} {p.ntnNo && `NTN ${p.ntnNo}`}
                </div>
              )}
              <div style={{ fontSize: 12, marginTop: 4 }}>{p.phoneNumbers.join(", ")}</div>
            </div>
            <button
              type="button"
              onClick={() => openLedger(p.id)}
              style={{ flexShrink: 0, padding: "6px 12px", borderRadius: 8, border: "1px solid var(--line)", background: "white", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
            >
              Statement
            </button>
          </div>
        ))}
      </div>

      {ledgerPartyId ? (
        <div className="glass-card" style={{ width: 380, flexShrink: 0, padding: 20, display: "flex", flexDirection: "column", gap: 10, overflowY: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Statement {ledger ? `— ${ledger.party.name}` : ""}</div>
            <button type="button" onClick={closeLedger} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 18, minHeight: 44, minWidth: 44 }}>
              &times;
            </button>
          </div>

          {ledgerError && <div className="error-text">{ledgerError}</div>}
          {!ledger && !ledgerError && <div className="muted" style={{ fontSize: 13 }}>Loading...</div>}

          {ledger && (
            <>
              <div className="muted" style={{ fontSize: 11.5 }}>
                {STATUS_LABELS[ledger.party.status]} &middot; {NATURE_LABELS[ledger.party.nature]}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: 10, borderRadius: 10, background: "oklch(97% 0.01 260)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                  <span className="muted">Total invoiced (posted)</span>
                  <span>Rs {ledger.totalInvoiced}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                  <span className="muted">Total received</span>
                  <span>Rs {ledger.totalReceived}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, paddingTop: 4, borderTop: "1px solid var(--line)" }}>
                  <span style={{ fontWeight: 700 }}>Net receivable</span>
                  <span style={{ fontWeight: 800 }}>Rs {ledger.netReceivable}</span>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: 10, borderRadius: 10, background: "oklch(97% 0.01 260)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                  <span className="muted">Total billed (posted)</span>
                  <span>Rs {ledger.totalBilled}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                  <span className="muted">Total paid</span>
                  <span>Rs {ledger.totalPaid}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, paddingTop: 4, borderTop: "1px solid var(--line)" }}>
                  <span style={{ fontWeight: 700 }}>Net payable</span>
                  <span style={{ fontWeight: 800 }}>Rs {ledger.netPayable}</span>
                </div>
              </div>
              <div className="muted" style={{ fontSize: 10.5 }}>
                Only counts posted Invoices/Purchase Invoices and their recorded payments — a Quotation, Delivery Note, Purchase Order, or Goods Receipt isn't a bill, so none of those affect these figures.
              </div>

              <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>Transactions</div>
              {ledger.transactions.length === 0 && <div className="muted" style={{ fontSize: 13 }}>No transactions on file yet.</div>}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {ledger.transactions.map((t) => {
                  const isReceivableSide = t.kind === "sale" || t.kind === "receipt";
                  const isIncrease = t.kind === "sale" || t.kind === "purchase";
                  const color = isReceivableSide ? "oklch(45% 0.13 150)" : "oklch(55% 0.18 25)";
                  return (
                    <div key={t.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, borderBottom: "1px solid var(--line)", paddingBottom: 6 }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{describeTransaction(t)}</div>
                        <div className="muted" style={{ fontSize: 11 }}>
                          {t.kind === "sale" || t.kind === "purchase"
                            ? `${t.documentNumber} · ${t.entityName} · ${t.documentDate} · ${t.status}`
                            : `${t.documentNumber} · ${t.documentDate}`}
                        </div>
                      </div>
                      <div style={{ fontWeight: 700, color }}>
                        {isIncrease ? "+" : "-"}Rs {t.totalAmount}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="glass-card" style={{ width: 340, flexShrink: 0, padding: 20, display: "flex", flexDirection: "column", gap: 10, overflowY: "auto" }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>New party</div>
          <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} style={{ padding: 10, fontSize: 13 }} />
          <label style={{ fontSize: 11.5 }} className="muted">
            Status of Party
            <select value={status} onChange={(e) => setStatus(e.target.value as PartyStatus)} style={{ display: "block", width: "100%", padding: 8, marginTop: 4, fontSize: 12.5 }}>
              {(Object.keys(STATUS_LABELS) as PartyStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 11.5 }} className="muted">
            Nature of Party
            <select value={nature} onChange={(e) => setNature(e.target.value as PartyNature)} style={{ display: "block", width: "100%", padding: 8, marginTop: 4, fontSize: 12.5 }}>
              {(Object.keys(NATURE_LABELS) as PartyNature[]).map((n) => (
                <option key={n} value={n}>{NATURE_LABELS[n]}</option>
              ))}
            </select>
          </label>
          <input placeholder="GST No (optional)" value={gstNo} onChange={(e) => setGstNo(e.target.value)} style={{ padding: 10, fontSize: 13 }} />
          <input placeholder="NTN No (optional)" value={ntnNo} onChange={(e) => setNtnNo(e.target.value)} style={{ padding: 10, fontSize: 13 }} />

          <div className="muted" style={{ fontSize: 11.5 }}>Phone numbers (1–5)</div>
          {phones.map((phone, i) => (
            <input key={i} placeholder={`Phone ${i + 1}`} value={phone} onChange={(e) => updatePhone(i, e.target.value)} style={{ padding: 10, fontSize: 13 }} />
          ))}
          {phones.length < 5 && (
            <button type="button" onClick={addPhoneField} style={{ alignSelf: "flex-start", fontSize: 12, cursor: "pointer" }}>
              + Add another phone
            </button>
          )}

          <button type="button" className="btn-primary" onClick={handleCreate} style={{ marginTop: 8 }}>
            Save party
          </button>
        </div>
      )}
    </div>
  );
}
