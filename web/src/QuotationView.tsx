import { useEffect, useState, type FormEvent } from "react";
import {
  createQuotation,
  getEntities,
  getParties,
  searchParts,
  type CheckoutDiscount,
  type CheckoutResult,
  type LegalEntity,
  type Party,
  type PartSearchResult,
} from "./api.js";

interface QuoteLine {
  controlPartId: string;
  partNumber: string;
  name: string;
  quantity: number;
  unitGrossPrice: number;
}

const KIYANI_AUTOS = "Kiyani Autos";

/**
 * First real Quotation creation. Per CLAUDE.md 5.10: a Quotation has no
 * accounting/stock effect and is never posted - so unlike PosView's
 * checkout, there's no "final sale" moment here, just "create the
 * record." Reuses the same design tokens/patterns as PosView rather than
 * sharing components with it - the two screens diverged enough (extra
 * reference fields here, no walk-in-vs-posted distinction) that a shared
 * component would need its own branching logic anyway.
 */
export function QuotationView() {
  const [entities, setEntities] = useState<LegalEntity[] | null>(null);
  const [entityId, setEntityId] = useState<string>("");
  const [customers, setCustomers] = useState<Party[]>([]);
  const [partyId, setPartyId] = useState<string>("");

  const [customerRef, setCustomerRef] = useState("");
  const [ourRefNo, setOurRefNo] = useState("");
  const [vehicleDetails, setVehicleDetails] = useState("");
  const [poNo, setPoNo] = useState("");
  const [validUntil, setValidUntil] = useState("");

  const [q, setQ] = useState("");
  const [results, setResults] = useState<PartSearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [discounts, setDiscounts] = useState<CheckoutDiscount[]>([]);
  const [discountLabel, setDiscountLabel] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<CheckoutResult | null>(null);

  useEffect(() => {
    getEntities().then((list) => {
      setEntities(list);
      if (list.length > 0) setEntityId(list[0].id);
    });
    getParties({ nature: "S3" }).then(setCustomers).catch(() => {});
  }, []);

  const selectedEntity = entities?.find((e) => e.id === entityId);
  const canDiscount = selectedEntity?.name === KIYANI_AUTOS;

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    setSearchError(null);
    try {
      setResults(await searchParts(q));
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
    }
  }

  function addLine(part: PartSearchResult) {
    setLines((prev) => {
      const existing = prev.find((l) => l.controlPartId === part.id);
      if (existing) {
        return prev.map((l) => (l.controlPartId === part.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, { controlPartId: part.id, partNumber: part.partNumber, name: part.name, quantity: 1, unitGrossPrice: 0 }];
    });
  }

  function updateLine(controlPartId: string, patch: Partial<QuoteLine>) {
    setLines((prev) => prev.map((l) => (l.controlPartId === controlPartId ? { ...l, ...patch } : l)));
  }

  function removeLine(controlPartId: string) {
    setLines((prev) => prev.filter((l) => l.controlPartId !== controlPartId));
  }

  function addDiscount() {
    const amount = Number(discountAmount);
    if (!discountLabel.trim() || !amount || amount <= 0) return;
    setDiscounts((prev) => [...prev, { label: discountLabel.trim(), amount }]);
    setDiscountLabel("");
    setDiscountAmount("");
  }

  const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.unitGrossPrice, 0);
  const discountTotal = discounts.reduce((sum, d) => sum + d.amount, 0);
  const total = Math.max(0, subtotal - discountTotal);

  async function handleCreate() {
    if (!entityId || lines.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const created = await createQuotation({
        legalEntityId: entityId,
        partyId: partyId || undefined,
        customerRef: customerRef.trim() || undefined,
        ourRefNo: ourRefNo.trim() || undefined,
        vehicleDetails: vehicleDetails.trim() || undefined,
        poNo: poNo.trim() || undefined,
        validUntil: validUntil || undefined,
        lines: lines.map((l) => ({ controlPartId: l.controlPartId, quantity: l.quantity, unitGrossPrice: l.unitGrossPrice })),
        discounts: canDiscount ? discounts : [],
      });
      setResult(created);
      setLines([]);
      setDiscounts([]);
      setCustomerRef("");
      setOurRefNo("");
      setVehicleDetails("");
      setPoNo("");
      setValidUntil("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create quotation");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ flex: 1, display: "flex", gap: 20, padding: 24, overflow: "hidden" }}>
      <div style={{ flex: 1.4, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>New quotation</div>

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
              <option value="">No customer selected</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <input placeholder="Customer Ref" value={customerRef} onChange={(e) => setCustomerRef(e.target.value)} style={{ padding: 8, fontSize: 12.5 }} />
            <input placeholder="Our Ref No." value={ourRefNo} onChange={(e) => setOurRefNo(e.target.value)} style={{ padding: 8, fontSize: 12.5 }} />
            <input placeholder="P.O. No." value={poNo} onChange={(e) => setPoNo(e.target.value)} style={{ padding: 8, fontSize: 12.5 }} />
            <label className="muted" style={{ fontSize: 11 }}>
              Valid until
              <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} style={{ display: "block", width: "100%", padding: 8, marginTop: 2, fontSize: 12.5 }} />
            </label>
          </div>
          <textarea
            placeholder="Vehicle details"
            value={vehicleDetails}
            onChange={(e) => setVehicleDetails(e.target.value)}
            style={{ padding: 8, fontSize: 12.5, minHeight: 44, fontFamily: "inherit" }}
          />
        </div>

        <form onSubmit={handleSearch} style={{ display: "flex", gap: 10 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search part number or name..."
            style={{ flex: 1, padding: "14px 16px", fontSize: 15, borderRadius: 14, border: "1px solid var(--line)", background: "white" }}
          />
          <button type="submit" className="btn-primary" style={{ padding: "0 26px" }}>Search</button>
        </form>
        {searchError && <div className="error-text">{searchError}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
          {results.map((part) => (
            <div key={part.id} className="glass-card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{part.name}</div>
              <div className="muted" style={{ fontSize: 11 }}>{part.partNumber}</div>
              <button type="button" className="btn-primary" onClick={() => addLine(part)}>Add</button>
            </div>
          ))}
        </div>
      </div>

      <div className="glass-card" style={{ width: 380, flexShrink: 0, display: "flex", flexDirection: "column", padding: 20, gap: 14, overflowY: "auto" }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>Quotation lines</div>

        {lines.length === 0 && <div className="muted" style={{ fontSize: 13 }}>No lines yet — search and add parts.</div>}

        {lines.map((line) => (
          <div key={line.controlPartId} style={{ display: "flex", flexDirection: "column", gap: 8, borderBottom: "1px solid var(--line)", paddingBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{line.name}</div>
                <div className="muted" style={{ fontSize: 11 }}>{line.partNumber}</div>
              </div>
              <button type="button" onClick={() => removeLine(line.controlPartId)} style={{ border: "none", background: "transparent", color: "var(--ink-300)", cursor: "pointer", fontSize: 13, minHeight: 44, minWidth: 44 }}>
                Remove
              </button>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <label className="muted" style={{ fontSize: 11 }}>
                Qty
                <input type="number" min={1} value={line.quantity} onChange={(e) => updateLine(line.controlPartId, { quantity: Math.max(1, Number(e.target.value)) })} style={{ width: 56, marginLeft: 6, padding: 6 }} />
              </label>
              <label className="muted" style={{ fontSize: 11 }}>
                Gross price (Rs)
                <input type="number" min={0} value={line.unitGrossPrice || ""} onChange={(e) => updateLine(line.controlPartId, { unitGrossPrice: Math.max(0, Number(e.target.value)) })} style={{ width: 90, marginLeft: 6, padding: 6 }} />
              </label>
            </div>
          </div>
        ))}

        {canDiscount && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {discounts.map((d, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span>{d.label}</span>
                <span style={{ color: "var(--accent)", fontWeight: 700 }}>-Rs {d.amount}</span>
              </div>
            ))}
            {discounts.length < 2 && (
              <div style={{ display: "flex", gap: 6 }}>
                <input placeholder="Discount label" value={discountLabel} onChange={(e) => setDiscountLabel(e.target.value)} style={{ flex: 1, padding: 6, fontSize: 12.5 }} />
                <input placeholder="Rs" type="number" value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} style={{ width: 70, padding: 6, fontSize: 12.5 }} />
                <button type="button" onClick={addDiscount} style={{ padding: "0 10px", cursor: "pointer" }}>+</button>
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 18, marginTop: 4 }}>
          <span>Total</span>
          <span>Rs {total.toFixed(2)}</span>
        </div>

        {error && <div className="error-text">{error}</div>}

        <button type="button" className="btn-primary" disabled={lines.length === 0 || saving} onClick={handleCreate}>
          {saving ? "Saving..." : "Create quotation"}
        </button>

        {result && (
          <div style={{ background: "oklch(95% 0.05 150)", borderRadius: 12, padding: 12, fontSize: 13 }}>
            Quotation saved — <strong>{result.documentNumber}</strong>, total Rs {result.totalAmount}
          </div>
        )}
      </div>
    </div>
  );
}
