import { useEffect, useState } from "react";
import {
  createInvoiceFromDeliveryNotes,
  getEntities,
  getParties,
  getUninvoicedDeliveryNotes,
  type InvoiceFromDeliveryNotesResult,
  type LegalEntity,
  type Party,
  type UninvoicedDeliveryNote,
} from "./api.js";

/**
 * Raises a real Invoice from one or more already-posted Delivery Notes
 * (CLAUDE.md 5.10: "An Invoice can draw from one DN or several combined")
 * — the confirmed path for KT corporate customers who buy on credit,
 * "settled invoice-wise." Until now the only way to create an Invoice was
 * POS checkout, which has no such flow.
 *
 * Staff pick whole DNs, not individual lines within them — combining
 * several DNs is the confirmed spec item; partial, line-by-line
 * invoicing of one DN across several Invoices isn't (see invoices.ts's
 * own header comment). Once a DN is invoiced it drops out of this list
 * for good — the server rejects selecting it again.
 */
export function InvoiceFromDeliveryView() {
  const [entities, setEntities] = useState<LegalEntity[] | null>(null);
  const [entityId, setEntityId] = useState<string>("");
  const [customers, setCustomers] = useState<Party[]>([]);
  const [partyId, setPartyId] = useState<string>("");

  const [dns, setDns] = useState<UninvoicedDeliveryNote[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<InvoiceFromDeliveryNotesResult | null>(null);

  useEffect(() => {
    getEntities().then((list) => {
      setEntities(list);
      if (list.length > 0) setEntityId(list[0].id);
    });
    getParties({ nature: "S3" }).then(setCustomers).catch(() => {});
  }, []);

  useEffect(() => {
    if (!entityId) return;
    setSelected({});
    getUninvoicedDeliveryNotes({ legalEntityId: entityId, partyId: partyId || undefined })
      .then(setDns)
      .catch(() => setDns([]));
  }, [entityId, partyId]);

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => ({ ...prev, [id]: checked }));
  }

  const selectedIds = Object.keys(selected).filter((id) => selected[id]);
  const selectedDns = dns.filter((d) => selected[d.id]);
  const total = selectedDns.reduce((sum, d) => sum + Number(d.totalAmount), 0);

  async function handleCreate() {
    if (selectedIds.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const created = await createInvoiceFromDeliveryNotes(selectedIds);
      setResult(created);
      setSelected({});
      getUninvoicedDeliveryNotes({ legalEntityId: entityId, partyId: partyId || undefined })
        .then(setDns)
        .catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create invoice");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ flex: 1, display: "flex", gap: 20, padding: 24, overflow: "hidden" }}>
      <div style={{ flex: 1.4, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>Raise invoice from delivery note(s)</div>

        <div className="glass-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {entities && (
              <select value={entityId} onChange={(e) => setEntityId(e.target.value)} style={{ padding: 8, borderRadius: 10, border: "1px solid var(--line)", fontSize: 12.5 }}>
                {entities.map((ent) => (
                  <option key={ent.id} value={ent.id}>{ent.name}</option>
                ))}
              </select>
            )}
            <select value={partyId} onChange={(e) => setPartyId(e.target.value)} style={{ padding: 8, borderRadius: 10, border: "1px solid var(--line)", fontSize: 12.5 }}>
              <option value="">Walk-in (no customer)</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="muted" style={{ fontSize: 11.5 }}>
            Only posted delivery notes not already invoiced show up here — combine as many as belong to one bill.
          </div>
        </div>

        <div className="glass-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Delivery notes ready to invoice</div>
          {dns.length === 0 && <div className="muted" style={{ fontSize: 13 }}>None for this entity/customer right now.</div>}
          {dns.map((d) => (
            <label key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
              <input type="checkbox" checked={selected[d.id] ?? false} onChange={(e) => toggle(d.id, e.target.checked)} style={{ width: 20, height: 20 }} />
              <span style={{ flex: 1 }}>{d.documentNumber} <span className="muted">({d.documentDate})</span></span>
              <span style={{ fontWeight: 700 }}>Rs {d.totalAmount}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="glass-card" style={{ width: 380, flexShrink: 0, display: "flex", flexDirection: "column", padding: 20, gap: 14, overflowY: "auto" }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>Invoice summary</div>

        {selectedDns.length === 0 && <div className="muted" style={{ fontSize: 13 }}>Select at least one delivery note.</div>}

        {selectedDns.map((d) => (
          <div key={d.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, borderBottom: "1px solid var(--line)", paddingBottom: 8 }}>
            <span>{d.documentNumber}</span>
            <span style={{ fontWeight: 700 }}>Rs {d.totalAmount}</span>
          </div>
        ))}

        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 18, marginTop: 4 }}>
          <span>Total</span>
          <span>Rs {total.toFixed(2)}</span>
        </div>

        <div className="muted" style={{ fontSize: 10.5 }}>
          Matching parts across the selected delivery notes at the same price combine onto one invoice line automatically.
        </div>

        {error && <div className="error-text">{error}</div>}

        <button type="button" className="btn-primary" disabled={selectedIds.length === 0 || saving} onClick={handleCreate}>
          {saving ? "Saving..." : "Create invoice"}
        </button>

        {result && (
          <div style={{ background: "oklch(95% 0.05 150)", borderRadius: 12, padding: 12, fontSize: 13 }}>
            Invoice saved — <strong>{result.documentNumber}</strong>, total Rs {result.totalAmount}, from {result.sourceDeliveryNoteNumbers.join(", ")}.
          </div>
        )}
      </div>
    </div>
  );
}
