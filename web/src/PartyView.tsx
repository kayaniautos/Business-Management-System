import { useEffect, useState } from "react";
import { createParty, getParties, type Party, type PartyNature, type PartyStatus } from "./api.js";

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

  const [name, setName] = useState("");
  const [status, setStatus] = useState<PartyStatus>("C2");
  const [nature, setNature] = useState<PartyNature>("S3");
  const [gstNo, setGstNo] = useState("");
  const [ntnNo, setNtnNo] = useState("");
  const [phones, setPhones] = useState<string[]>([""]);

  function load() {
    getParties().then(setParties).catch((e) => setError(String(e)));
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
          <div key={p.id} className="glass-card" style={{ padding: 14 }}>
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
        ))}
      </div>

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
    </div>
  );
}
