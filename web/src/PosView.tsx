import { useEffect, useState, type FormEvent } from "react";
import {
  carModelLabel,
  checkout,
  getCarModels,
  getEntities,
  getParties,
  searchParts,
  type CarModel,
  type CheckoutDiscount,
  type CheckoutResult,
  type LegalEntity,
  type LoginResult,
  type Party,
  type PartSearchResult,
} from "./api.js";

interface CartLine {
  // Stable React key / dedup identity — "part:<id>" or "deal:<id>", since
  // a cart line is either a regular part or a Deal Part bundle (CLAUDE.md
  // 5.4), never both.
  key: string;
  controlPartId?: string;
  dealPartId?: string;
  partNumber?: string;
  name: string;
  quantity: number;
  unitGrossPrice: number;
}

const KIYANI_AUTOS = "Kiyani Autos";

export function PosView({ user }: { user: LoginResult }) {
  const [entities, setEntities] = useState<LegalEntity[] | null>(null);
  const [entityId, setEntityId] = useState<string>("");
  // Customer Receivable A/C (S3) parties only — the reading that a party
  // needs that Nature to be a valid sale counterparty, per CLAUDE.md 5.5.
  const [customers, setCustomers] = useState<Party[]>([]);
  const [partyId, setPartyId] = useState<string>("");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PartSearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  // Vehicle fitment search (handover doc §6.2: "by vehicle model + year
  // range") — cascading Make -> Model, where each Model option is
  // labeled with its own year range so picking it resolves "which
  // generation" without a separate year field (Mehmoon's direction
  // 2026-09-10).
  const [carModels, setCarModels] = useState<CarModel[]>([]);
  const [selectedMake, setSelectedMake] = useState("");
  const [selectedCarModelId, setSelectedCarModelId] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discounts, setDiscounts] = useState<CheckoutDiscount[]>([]);
  const [discountLabel, setDiscountLabel] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutResult, setCheckoutResult] = useState<CheckoutResult | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);

  useEffect(() => {
    getEntities().then((list) => {
      setEntities(list);
      if (list.length > 0) setEntityId(list[0].id);
    });
    getParties({ nature: "S3" }).then(setCustomers).catch(() => {});
    getCarModels().then(setCarModels).catch(() => {});
  }, []);

  const selectedEntity = entities?.find((e) => e.id === entityId);
  const canDiscount = selectedEntity?.name === KIYANI_AUTOS;

  const makes = [...new Set(carModels.map((c) => c.make))].sort();
  const modelsForMake = carModels.filter((c) => c.make === selectedMake);

  async function runSearch(carModelId?: string) {
    setSearchError(null);
    if (!q.trim() && !carModelId) {
      setResults([]);
      return;
    }
    try {
      // Deal Parts (CLAUDE.md 5.4) merged into the same results — POS is
      // the only screen that can sell one, so it's the only search call
      // that opts in (Mehmoon's direction 2026-09-10: a bundle should show
      // up "same like other items," not in a separate picker). Deal Parts
      // have no fitment, so they only ever show up when there's a typed q.
      setResults(await searchParts(q, { includeDealParts: true, carModelId }));
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
    }
  }

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    await runSearch(selectedCarModelId || undefined);
  }

  function handleSelectModel(carModelId: string) {
    setSelectedCarModelId(carModelId);
    runSearch(carModelId || undefined);
  }

  function addToCart(part: PartSearchResult) {
    if (part.isDealPart) {
      const key = `deal:${part.id}`;
      setCart((prev) => {
        const existing = prev.find((l) => l.key === key);
        if (existing) return prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l));
        return [...prev, { key, dealPartId: part.id, name: part.name, quantity: 1, unitGrossPrice: 0 }];
      });
      return;
    }
    const key = `part:${part.id}`;
    setCart((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        return prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [
        ...prev,
        { key, controlPartId: part.id, partNumber: part.partNumber ?? undefined, name: part.name, quantity: 1, unitGrossPrice: 0 },
      ];
    });
  }

  function updateLine(key: string, patch: Partial<CartLine>) {
    setCart((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setCart((prev) => prev.filter((l) => l.key !== key));
  }

  function addDiscount() {
    const amount = Number(discountAmount);
    if (!discountLabel.trim() || !amount || amount <= 0) return;
    setDiscounts((prev) => [...prev, { label: discountLabel.trim(), amount }]);
    setDiscountLabel("");
    setDiscountAmount("");
  }

  const subtotal = cart.reduce((sum, l) => sum + l.quantity * l.unitGrossPrice, 0);
  const discountTotal = discounts.reduce((sum, d) => sum + d.amount, 0);
  const total = Math.max(0, subtotal - discountTotal);

  async function handleCheckout() {
    if (!entityId || cart.length === 0) return;
    setCheckingOut(true);
    setCheckoutError(null);
    try {
      const result = await checkout(
        entityId,
        cart.map((l) => ({
          controlPartId: l.controlPartId,
          dealPartId: l.dealPartId,
          quantity: l.quantity,
          unitGrossPrice: l.unitGrossPrice,
        })),
        canDiscount ? discounts : [],
        partyId || undefined,
      );
      setCheckoutResult(result);
      setCart([]);
      setDiscounts([]);
      setPartyId("");
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setCheckingOut(false);
    }
  }

  return (
    <div style={{ flex: 1, display: "flex", gap: 20, padding: 24, overflow: "hidden" }}>
      <div style={{ flex: 1.6, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
        {entities && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="muted" style={{ fontSize: 12.5, fontWeight: 700 }}>Selling as:</span>
            <select
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid var(--line)", fontWeight: 700, fontSize: 13.5, background: "white" }}
            >
              {entities.map((ent) => (
                <option key={ent.id} value={ent.id}>
                  {ent.name}
                </option>
              ))}
            </select>
          </div>
        )}
          <form onSubmit={handleSearch} style={{ display: "flex", gap: 10 }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search part number or name..."
              style={{ flex: 1, padding: "14px 16px", fontSize: 15, borderRadius: 14, border: "1px solid var(--line)", background: "white" }}
            />
            <button type="submit" className="btn-primary" style={{ padding: "0 26px" }}>
              Search
            </button>
          </form>

          {carModels.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="muted" style={{ fontSize: 12.5, fontWeight: 700 }}>Or find by vehicle:</span>
              <select
                value={selectedMake}
                onChange={(e) => {
                  setSelectedMake(e.target.value);
                  handleSelectModel("");
                }}
                style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 12.5, background: "white" }}
              >
                <option value="">Make...</option>
                {makes.map((make) => (
                  <option key={make} value={make}>{make}</option>
                ))}
              </select>
              <select
                value={selectedCarModelId}
                onChange={(e) => handleSelectModel(e.target.value)}
                disabled={!selectedMake}
                style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 12.5, background: "white" }}
              >
                <option value="">Model...</option>
                {modelsForMake.map((c) => (
                  <option key={c.id} value={c.id}>{carModelLabel(c)}</option>
                ))}
              </select>
              {selectedCarModelId && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMake("");
                    handleSelectModel("");
                  }}
                  style={{ border: "none", background: "none", cursor: "pointer", color: "var(--ink-300)", fontSize: 12.5 }}
                >
                  Clear
                </button>
              )}
            </div>
          )}
          {searchError && <div className="error-text">{searchError}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
            {results.map((part) => (
              <div
                key={part.id}
                className="glass-card"
                style={{
                  padding: 16,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  borderLeft: part.isDealPart ? "4px solid var(--accent)" : undefined,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 14.5 }}>{part.name}</div>
                  {part.isDealPart && (
                    <span
                      style={{
                        fontSize: 9.5,
                        fontWeight: 800,
                        letterSpacing: 0.3,
                        color: "white",
                        background: "var(--accent)",
                        borderRadius: 6,
                        padding: "2px 6px",
                      }}
                    >
                      BUNDLE
                    </span>
                  )}
                </div>
                <div className="muted" style={{ fontSize: 12 }}>{part.isDealPart ? "Deal part" : part.partNumber}</div>
                <button type="button" className="btn-primary" onClick={() => addToCart(part)}>
                  Add
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card" style={{ width: 380, flexShrink: 0, display: "flex", flexDirection: "column", padding: 20, gap: 14, overflowY: "auto" }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Current sale</div>

          <select
            value={partyId}
            onChange={(e) => setPartyId(e.target.value)}
            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 12.5, background: "white" }}
          >
            <option value="">Walk-in customer</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          {cart.length === 0 && <div className="muted" style={{ fontSize: 13 }}>Cart is empty — search and add parts.</div>}

          {cart.map((line) => (
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
                <label style={{ fontSize: 11 }} className="muted">
                  Qty
                  <input
                    type="number"
                    min={1}
                    value={line.quantity}
                    onChange={(e) => updateLine(line.key, { quantity: Math.max(1, Number(e.target.value)) })}
                    style={{ width: 56, marginLeft: 6, padding: 6 }}
                  />
                </label>
                <label style={{ fontSize: 11 }} className="muted">
                  Gross price (Rs)
                  <input
                    type="number"
                    min={0}
                    value={line.unitGrossPrice || ""}
                    onChange={(e) => updateLine(line.key, { unitGrossPrice: Math.max(0, Number(e.target.value)) })}
                    style={{ width: 90, marginLeft: 6, padding: 6 }}
                  />
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
                  <button type="button" onClick={addDiscount} style={{ padding: "0 10px", cursor: "pointer" }}>
                    +
                  </button>
                </div>
              )}
            </div>
          )}
          {!canDiscount && cart.length > 0 && (
            <div className="muted" style={{ fontSize: 11.5 }}>Discounts are only available for Kiyani Autos sales.</div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 18, marginTop: 4 }}>
            <span>Total</span>
            <span>Rs {total.toFixed(2)}</span>
          </div>

          {checkoutError && <div className="error-text">{checkoutError}</div>}

          <button type="button" className="btn-primary" disabled={cart.length === 0 || checkingOut} onClick={handleCheckout}>
            {checkingOut ? "Processing..." : `Checkout · Rs ${total.toFixed(2)}`}
          </button>

          {checkoutResult && (
            <div style={{ background: "oklch(95% 0.05 150)", borderRadius: 12, padding: 12, fontSize: 13 }}>
              Sale complete — <strong>{checkoutResult.documentNumber}</strong>, total Rs {checkoutResult.totalAmount}
            </div>
          )}
        </div>
      </div>
  );
}
