import { useEffect, useState, type FormEvent } from "react";
import {
  createDeliveryNote,
  getEntities,
  getParties,
  getSalesDocument,
  getSalesHistory,
  searchParts,
  type CheckoutDiscount,
  type CheckoutResult,
  type LegalEntity,
  type Party,
  type PartSearchResult,
  type SalesDocumentDetail,
  type SalesDocumentSummary,
} from "./api.js";

interface DnLine {
  controlPartId: string;
  partNumber: string;
  name: string;
  quantity: number;
  unitGrossPrice: number;
  fromQuotationLine?: boolean;
}

const KIYANI_AUTOS = "Kiyani Autos";

/**
 * First real Delivery Note creation, in two modes per CLAUDE.md 5.10/
 * handover 8.2: "DNs can be prepared directly as a first step" (New) or
 * built from an existing Quotation, picking specific lines individually
 * ("selection of items happens individually... not necessarily the whole
 * quotation" — so lines start unchecked here, not pre-selected).
 *
 * Reference fields (Customer Ref etc.) are NOT auto-copied from the
 * source quotation even in "from Quotation" mode — only the party and
 * lines are. Not because the spec says not to, but because the backend
 * detail response doesn't carry those fields yet, and auto-fill wasn't
 * essential enough to add them just for this. Worth revisiting.
 */
export function DeliveryNoteView() {
  const [mode, setMode] = useState<"new" | "from-quotation">("new");
  const [entities, setEntities] = useState<LegalEntity[] | null>(null);
  const [entityId, setEntityId] = useState<string>("");
  const [customers, setCustomers] = useState<Party[]>([]);
  const [partyId, setPartyId] = useState<string>("");

  const [quotations, setQuotations] = useState<SalesDocumentSummary[]>([]);
  const [sourceQuotationId, setSourceQuotationId] = useState<string>("");
  const [sourceDetail, setSourceDetail] = useState<SalesDocumentDetail | null>(null);
  const [selectedQuoteLines, setSelectedQuoteLines] = useState<Record<number, { checked: boolean; quantity: number }>>({});

  const [customerRef, setCustomerRef] = useState("");
  const [ourRefNo, setOurRefNo] = useState("");
  const [vehicleDetails, setVehicleDetails] = useState("");
  const [poNo, setPoNo] = useState("");

  const [q, setQ] = useState("");
  const [results, setResults] = useState<PartSearchResult[]>([]);
  const [newLines, setNewLines] = useState<DnLine[]>([]);
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

  useEffect(() => {
    if (mode !== "from-quotation" || !entityId) return;
    getSalesHistory({ legalEntityId: entityId, documentType: "quotation" }).then(setQuotations).catch(() => {});
  }, [mode, entityId]);

  useEffect(() => {
    if (!sourceQuotationId) {
      setSourceDetail(null);
      return;
    }
    getSalesDocument(sourceQuotationId).then((detail) => {
      setSourceDetail(detail);
      setPartyId(detail.partyId ?? "");
      const initial: Record<number, { checked: boolean; quantity: number }> = {};
      detail.lines.forEach((l) => {
        initial[l.lineNumber] = { checked: false, quantity: l.quantity };
      });
      setSelectedQuoteLines(initial);
    });
  }, [sourceQuotationId]);

  const selectedEntity = entities?.find((e) => e.id === entityId);
  const canDiscount = selectedEntity?.name === KIYANI_AUTOS;

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    try {
      setResults(await searchParts(q));
    } catch {
      setResults([]);
    }
  }

  function addNewLine(part: PartSearchResult) {
    setNewLines((prev) => {
      const existing = prev.find((l) => l.controlPartId === part.id);
      if (existing) return prev.map((l) => (l.controlPartId === part.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, { controlPartId: part.id, partNumber: part.partNumber ?? "", name: part.name, quantity: 1, unitGrossPrice: 0 }];
    });
  }

  function updateNewLine(controlPartId: string, patch: Partial<DnLine>) {
    setNewLines((prev) => prev.map((l) => (l.controlPartId === controlPartId ? { ...l, ...patch } : l)));
  }

  function toggleQuoteLine(lineNumber: number, checked: boolean) {
    setSelectedQuoteLines((prev) => ({ ...prev, [lineNumber]: { ...prev[lineNumber], checked } }));
  }

  function updateQuoteLineQty(lineNumber: number, quantity: number) {
    setSelectedQuoteLines((prev) => ({ ...prev, [lineNumber]: { ...prev[lineNumber], quantity } }));
  }

  function addDiscount() {
    const amount = Number(discountAmount);
    if (!discountLabel.trim() || !amount || amount <= 0) return;
    setDiscounts((prev) => [...prev, { label: discountLabel.trim(), amount }]);
    setDiscountLabel("");
    setDiscountAmount("");
  }

  /**
   * The actual line set that will be submitted, resolved from whichever
   * mode is active. DN doesn't support Deal Part lines yet (only POS
   * checkout does — CLAUDE.md 5.4) — a Quotation can't actually produce
   * one today since QuotationView never creates dealPartId lines, but
   * `controlPartId` is nullable on the shared detail type now, so this
   * filters defensively rather than assuming it's always present.
   */
  function resolveLines() {
    if (mode === "new") {
      return newLines.map((l) => ({ controlPartId: l.controlPartId, quantity: l.quantity, unitGrossPrice: l.unitGrossPrice }));
    }
    if (!sourceDetail) return [];
    return sourceDetail.lines
      .filter((l) => l.controlPartId && selectedQuoteLines[l.lineNumber]?.checked)
      .map((l) => ({
        controlPartId: l.controlPartId as string,
        quantity: selectedQuoteLines[l.lineNumber].quantity,
        unitGrossPrice: Number(l.unitGrossPrice),
      }));
  }

  const effectiveLines = resolveLines();
  const subtotal = effectiveLines.reduce((sum, l) => sum + l.quantity * l.unitGrossPrice, 0);
  const discountTotal = discounts.reduce((sum, d) => sum + d.amount, 0);
  const total = Math.max(0, subtotal - discountTotal);

  async function handleCreate() {
    if (!entityId) return;
    setSaving(true);
    setError(null);
    try {
      if (mode === "from-quotation" && !sourceDetail) throw new Error("Pick a quotation first");
      const lines = resolveLines();
      if (lines.length === 0) {
        throw new Error(mode === "new" ? "Add at least one part" : "Select at least one line from the quotation");
      }

      const created = await createDeliveryNote({
        legalEntityId: entityId,
        partyId: partyId || undefined,
        customerRef: customerRef.trim() || undefined,
        ourRefNo: ourRefNo.trim() || undefined,
        vehicleDetails: vehicleDetails.trim() || undefined,
        poNo: poNo.trim() || undefined,
        sourceQuotationId: mode === "from-quotation" ? sourceQuotationId : undefined,
        lines,
        discounts: canDiscount ? discounts : [],
      });
      setResult(created);
      setNewLines([]);
      setDiscounts([]);
      setSourceQuotationId("");
      setSourceDetail(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create delivery note");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ flex: 1, display: "flex", gap: 20, padding: 24, overflow: "hidden" }}>
      <div style={{ flex: 1.4, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>New delivery note</div>
          <div style={{ display: "flex", gap: 6 }}>
            {(["new", "from-quotation"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 10,
                  border: "1px solid var(--line)",
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: "pointer",
                  background: mode === m ? "var(--ink-900)" : "white",
                  color: mode === m ? "white" : "var(--ink-700)",
                }}
              >
                {m === "new" ? "Prepare directly" : "From Quotation"}
              </button>
            ))}
          </div>
        </div>

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

          {mode === "from-quotation" && (
            <select value={sourceQuotationId} onChange={(e) => setSourceQuotationId(e.target.value)} style={{ padding: 8, borderRadius: 10, border: "1px solid var(--line)", fontSize: 12.5 }}>
              <option value="">Select a quotation...</option>
              {quotations.map((q) => (
                <option key={q.id} value={q.id}>{q.documentNumber} — {q.partyName ?? "No customer"} — Rs {q.totalAmount}</option>
              ))}
            </select>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <input placeholder="Customer Ref" value={customerRef} onChange={(e) => setCustomerRef(e.target.value)} style={{ padding: 8, fontSize: 12.5 }} />
            <input placeholder="Our Ref No." value={ourRefNo} onChange={(e) => setOurRefNo(e.target.value)} style={{ padding: 8, fontSize: 12.5 }} />
            <input placeholder="P.O. No." value={poNo} onChange={(e) => setPoNo(e.target.value)} style={{ padding: 8, fontSize: 12.5 }} />
          </div>
          <textarea placeholder="Vehicle details" value={vehicleDetails} onChange={(e) => setVehicleDetails(e.target.value)} style={{ padding: 8, fontSize: 12.5, minHeight: 44, fontFamily: "inherit" }} />
        </div>

        {mode === "new" ? (
          <>
            <form onSubmit={handleSearch} style={{ display: "flex", gap: 10 }}>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search part number or name..." style={{ flex: 1, padding: "14px 16px", fontSize: 15, borderRadius: 14, border: "1px solid var(--line)", background: "white" }} />
              <button type="submit" className="btn-primary" style={{ padding: "0 26px" }}>Search</button>
            </form>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
              {results.map((part) => (
                <div key={part.id} className="glass-card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{part.name}</div>
                  <div className="muted" style={{ fontSize: 11 }}>{part.partNumber}</div>
                  <button type="button" className="btn-primary" onClick={() => addNewLine(part)}>Add</button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="glass-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Pick lines to carry onto this DN</div>
            {!sourceDetail && <div className="muted" style={{ fontSize: 13 }}>Select a quotation above.</div>}
            {sourceDetail?.lines.filter((l) => l.controlPartId).map((l) => (
              <label key={l.lineNumber} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                <input type="checkbox" checked={selectedQuoteLines[l.lineNumber]?.checked ?? false} onChange={(e) => toggleQuoteLine(l.lineNumber, e.target.checked)} style={{ width: 20, height: 20 }} />
                <span style={{ flex: 1 }}>{l.displayName ?? l.catalogName} <span className="muted">({l.partNumber})</span></span>
                <input type="number" min={1} max={l.quantity} value={selectedQuoteLines[l.lineNumber]?.quantity ?? l.quantity} onChange={(e) => updateQuoteLineQty(l.lineNumber, Math.min(l.quantity, Math.max(1, Number(e.target.value))))} style={{ width: 56, padding: 6 }} />
                <span className="muted">of {l.quantity}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="glass-card" style={{ width: 380, flexShrink: 0, display: "flex", flexDirection: "column", padding: 20, gap: 14, overflowY: "auto" }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>Delivery note lines</div>

        {mode === "new" &&
          newLines.map((line) => (
            <div key={line.controlPartId} style={{ display: "flex", flexDirection: "column", gap: 8, borderBottom: "1px solid var(--line)", paddingBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{line.name}</div>
              <div className="muted" style={{ fontSize: 11 }}>{line.partNumber}</div>
              <div style={{ display: "flex", gap: 10 }}>
                <label className="muted" style={{ fontSize: 11 }}>
                  Qty
                  <input type="number" min={1} value={line.quantity} onChange={(e) => updateNewLine(line.controlPartId, { quantity: Math.max(1, Number(e.target.value)) })} style={{ width: 56, marginLeft: 6, padding: 6 }} />
                </label>
                <label className="muted" style={{ fontSize: 11 }}>
                  Gross price (Rs)
                  <input type="number" min={0} value={line.unitGrossPrice || ""} onChange={(e) => updateNewLine(line.controlPartId, { unitGrossPrice: Math.max(0, Number(e.target.value)) })} style={{ width: 90, marginLeft: 6, padding: 6 }} />
                </label>
              </div>
            </div>
          ))}

        {mode === "from-quotation" &&
          sourceDetail?.lines
            .filter((l) => selectedQuoteLines[l.lineNumber]?.checked)
            .map((l) => (
              <div key={l.lineNumber} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, borderBottom: "1px solid var(--line)", paddingBottom: 8 }}>
                <span>{l.displayName ?? l.catalogName} &times; {selectedQuoteLines[l.lineNumber].quantity}</span>
                <span style={{ fontWeight: 700 }}>Rs {(selectedQuoteLines[l.lineNumber].quantity * Number(l.unitGrossPrice)).toFixed(2)}</span>
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

        <button type="button" className="btn-primary" disabled={saving} onClick={handleCreate}>
          {saving ? "Saving..." : "Create delivery note"}
        </button>

        {result && (
          <div style={{ background: "oklch(95% 0.05 150)", borderRadius: 12, padding: 12, fontSize: 13 }}>
            Delivery note saved — <strong>{result.documentNumber}</strong>, total Rs {result.totalAmount}
          </div>
        )}
      </div>
    </div>
  );
}
