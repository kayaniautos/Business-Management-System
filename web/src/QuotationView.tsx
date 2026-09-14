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
  // Stable identity — "part:<id>" or "deal:<id>", since a line is either
  // a regular part or a Deal Part bundle (CLAUDE.md 5.4), never both.
  // Deal Part support on Quotation built 2026-09-13 — same pattern as
  // PosView's own cart.
  key: string;
  controlPartId?: string;
  dealPartId?: string;
  partNumber?: string;
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
      // Deal Parts (CLAUDE.md 5.4) merged into results, same as POS —
      // built 2026-09-13, Quotation was the last search call still
      // opted out.
      setResults(await searchParts(q, { includeDealParts: true }));
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
    }
  }

  function addLine(part: PartSearchResult) {
    const key = part.isDealPart ? `deal:${part.id}` : `part:${part.id}`;
    setLines((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        return prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [
        ...prev,
        part.isDealPart
          ? { key, dealPartId: part.id, name: part.name, quantity: 1, unitGrossPrice: 0 }
          : { key, controlPartId: part.id, partNumber: part.partNumber ?? undefined, name: part.name, quantity: 1, unitGrossPrice: 0 },
      ];
    });
  }

  function updateLine(key: string, patch: Partial<QuoteLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
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
        lines: lines.map((l) => ({ controlPartId: l.controlPartId, dealPartId: l.dealPartId, quantity: l.quantity, unitGrossPrice: l.unitGrossPrice })),
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
    <div className="view-row">
      <div className="view-main" style={{ flex: 1.4, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
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
            <div
              key={part.id}
              className="glass-card"
              style={{ padding: 14, display: "flex", flexDirection: "column", gap: 6, borderLeft: part.isDealPart ? "4px solid var(--accent)" : undefined }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{part.name}</div>
                {part.isDealPart && (
                  <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.3, color: "white", background: "var(--accent)", borderRadius: 6, padding: "2px 6px" }}>
                    BUNDLE
                  </span>
                )}
              </div>
              <div className="muted" style={{ fontSize: 11 }}>{part.isDealPart ? "Deal part" : part.partNumber}</div>
              <button type="button" className="btn-primary" onClick={() => addLine(part)}>Add</button>
            </div>
          ))}
        </div>
      </div>

      <div className="glass-card view-panel" style={{ width: 380, flexShrink: 0, display: "flex", flexDirection: "column", padding: 20, gap: 14, overflowY: "auto" }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>Quotation lines</div>

        {lines.length === 0 && <div className="muted" style={{ fontSize: 13 }}>No lines yet — search and add parts.</div>}

        {lines.map((line) => (
          <div key={line.key} style={{ display: "flex", flexDirection: "column", gap: 8, borderBottom: "1px solid var(--line)", paddingBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{line.name}</div>
                <div className="muted" style={{ fontSize: 11 }}>{line.dealPartId ? "Deal part" : line.partNumber}</div>
              </div>
              <button type="button" onClick={() => removeLine(line.key)} style={{ border: "none", background: "transparent", color: "var(--ink-300)", cursor: "pointer", fontSize: 13, minHeight: 44, minWidth: 44 }}>
                Remove
              </button>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <label className="muted" style={{ fontSize: 11 }}>
                Qty
                <input type="number" min={1} value={line.quantity} onChange={(e) => updateLine(line.key, { quantity: Math.max(1, Number(e.target.value)) })} style={{ width: 56, marginLeft: 6, padding: 6 }} />
              </label>
              <label className="muted" style={{ fontSize: 11 }}>
                Gross price (Rs)
                <input type="number" min={0} value={line.unitGrossPrice || ""} onChange={(e) => updateLine(line.key, { unitGrossPrice: Math.max(0, Number(e.target.value)) })} style={{ width: 90, marginLeft: 6, padding: 6 }} />
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
