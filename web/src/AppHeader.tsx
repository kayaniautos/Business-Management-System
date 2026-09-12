import { useEffect, useRef, useState } from "react";
import type { LoginResult } from "./api.js";

export type View =
  | "pos"
  | "quotations"
  | "delivery-notes"
  | "inventory"
  | "parties"
  | "sales-history"
  | "stock-adjustments"
  | "deal-parts"
  | "admin-settings"
  | "purchase-orders"
  | "goods-receipts"
  | "purchase-invoices"
  | "purchase-history"
  | "supplier-returns"
  | "car-models";

const VIEW_LABELS: Record<View, string> = {
  pos: "POS Counter",
  quotations: "Quotations",
  "delivery-notes": "Delivery Notes",
  inventory: "Inventory",
  parties: "Parties",
  "sales-history": "Sales History (Ctrl+H)",
  "stock-adjustments": "Stock Adjustment",
  "deal-parts": "Deal Parts",
  "admin-settings": "Admin Settings",
  "purchase-orders": "Purchase Orders",
  "goods-receipts": "Goods Receipts",
  "purchase-invoices": "Purchase Invoices",
  "purchase-history": "Purchase History",
  "supplier-returns": "Supplier Returns",
  "car-models": "Car Models",
};

/**
 * Module grouping for the nav bar (Mehmoon's direction, 2026-09-10): a
 * flat row of 8 buttons was too much for counter staff who need to find
 * POS fast (CLAUDE.md "fast counter operation"). POS and Parties stay as
 * standalone always-visible tabs; everything else groups under a
 * dropdown by function. Chosen as a module split (not just a "More" menu)
 * because it scales cleanly as Purchasing/Accounting/Reports get built in
 * later phases — those become new module entries here rather than
 * overloading Sales/Inventory further.
 *
 * This only groups the nav visually — every view is still reachable by
 * every logged-in user right now. Role-based visibility (which tabs a
 * given role even sees) is a deliberate follow-up, not done here — see
 * DECISIONS.md 2026-09-10.
 */
interface NavModule {
  key: string;
  label: string;
  views: View[];
}

const MODULES: NavModule[] = [
  { key: "sales", label: "Sales", views: ["quotations", "delivery-notes", "sales-history"] },
  { key: "inventory", label: "Inventory", views: ["inventory", "stock-adjustments", "deal-parts", "car-models"] },
  {
    key: "purchasing",
    label: "Purchasing",
    views: ["purchase-orders", "goods-receipts", "purchase-invoices", "supplier-returns", "purchase-history"],
  },
];

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: "8px 16px",
  borderRadius: 10,
  border: "none",
  fontWeight: 700,
  fontSize: 13.5,
  cursor: "pointer",
  background: active ? "var(--ink-900)" : "transparent",
  color: active ? "white" : "var(--ink-700)",
});

export function AppHeader({
  user,
  view,
  onViewChange,
  onLogout,
}: {
  user: LoginResult;
  view: View;
  onViewChange: (v: View) => void;
  onLogout: () => void;
}) {
  const [openModule, setOpenModule] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpenModule(null);
    }
    window.addEventListener("mousedown", onClickOutside);
    return () => window.removeEventListener("mousedown", onClickOutside);
  }, []);

  function selectView(v: View) {
    onViewChange(v);
    setOpenModule(null);
  }

  return (
    <div
      style={{
        height: 72,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 28px",
        background: "oklch(99% 0.004 85 / .6)",
        backdropFilter: "blur(24px)",
        // The header's own backdrop-filter creates a stacking context with
        // an implicit z-index of 0, which put it in the SAME paint bucket
        // as any `.glass-card` in the page content below (glass-card also
        // uses backdrop-filter) — ties in that bucket resolve by DOM order,
        // and the header comes first, so it was painting BEHIND page
        // content. A module dropdown with enough items to extend past the
        // header (Purchasing's 4 items) then had its lower entries visually
        // covered and unclickable. An explicit positive z-index here moves
        // the whole header out of that tie and reliably above all content.
        zIndex: 30,
        borderBottom: "1px solid var(--line)",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <img src="/kt-logo.png" alt="Kiyan Traders" className="brand-logo" style={{ height: 36 }} />
        <nav ref={navRef} style={{ display: "flex", gap: 6, position: "relative" }}>
          <button type="button" onClick={() => selectView("pos")} style={tabStyle(view === "pos")}>
            {VIEW_LABELS.pos}
          </button>

          {MODULES.map((mod) => {
            const active = mod.views.includes(view);
            const isOpen = openModule === mod.key;
            return (
              <div key={mod.key} style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => setOpenModule(isOpen ? null : mod.key)}
                  style={tabStyle(active)}
                >
                  {mod.label} {isOpen ? "▴" : "▾"}
                </button>
                {isOpen && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 6px)",
                      left: 0,
                      background: "white",
                      border: "1px solid var(--line)",
                      borderRadius: 12,
                      boxShadow: "0 12px 32px oklch(0% 0 0 / .12)",
                      minWidth: 220,
                      overflow: "hidden",
                      zIndex: 20,
                    }}
                  >
                    {mod.views.map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => selectView(v)}
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          padding: "12px 16px",
                          minHeight: 44,
                          border: "none",
                          fontWeight: 700,
                          fontSize: 13.5,
                          cursor: "pointer",
                          background: view === v ? "var(--ink-900)" : "white",
                          color: view === v ? "white" : "var(--ink-700)",
                        }}
                      >
                        {VIEW_LABELS[v]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <button type="button" onClick={() => selectView("parties")} style={tabStyle(view === "parties")}>
            {VIEW_LABELS.parties}
          </button>
          {user.isAdmin && (
            <button type="button" onClick={() => selectView("admin-settings")} style={tabStyle(view === "admin-settings")}>
              {VIEW_LABELS["admin-settings"]}
            </button>
          )}
        </nav>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5 }}>
          {user.fullName} <span className="muted">&middot; {user.roles.join(", ") || "No role"}</span>
        </div>
        <button
          type="button"
          onClick={onLogout}
          style={{
            padding: "8px 14px",
            borderRadius: 10,
            border: "1px solid var(--line)",
            background: "white",
            fontWeight: 700,
            fontSize: 12.5,
            cursor: "pointer",
            color: "var(--ink-700)",
          }}
        >
          Log out
        </button>
      </div>
    </div>
  );
}
