import type { LoginResult } from "./api.js";

export type View = "pos" | "quotations" | "delivery-notes" | "inventory" | "parties" | "sales-history";

const VIEW_LABELS: Record<View, string> = {
  pos: "POS Counter",
  quotations: "Quotations",
  "delivery-notes": "Delivery Notes",
  inventory: "Inventory",
  parties: "Parties",
  "sales-history": "Sales History (Ctrl+H)",
};

export function AppHeader({
  user,
  view,
  onViewChange,
}: {
  user: LoginResult;
  view: View;
  onViewChange: (v: View) => void;
}) {
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
        borderBottom: "1px solid var(--line)",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <img src="/kt-logo.png" alt="Kiyan Traders" className="brand-logo" style={{ height: 36 }} />
        <nav style={{ display: "flex", gap: 6 }}>
          {(["pos", "quotations", "delivery-notes", "inventory", "parties", "sales-history"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onViewChange(v)}
              style={{
                padding: "8px 16px",
                borderRadius: 10,
                border: "none",
                fontWeight: 700,
                fontSize: 13.5,
                cursor: "pointer",
                background: view === v ? "var(--ink-900)" : "transparent",
                color: view === v ? "white" : "var(--ink-700)",
              }}
            >
              {VIEW_LABELS[v]}
            </button>
          ))}
        </nav>
      </div>
      <div style={{ fontWeight: 700, fontSize: 13.5 }}>
        {user.fullName} <span className="muted">&middot; {user.roles.join(", ") || "No role"}</span>
      </div>
    </div>
  );
}
