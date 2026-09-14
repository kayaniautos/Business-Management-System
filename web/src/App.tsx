import { useEffect, useState } from "react";
import { LoginView } from "./LoginView.js";
import { PosView } from "./PosView.js";
import { QuotationView } from "./QuotationView.js";
import { DeliveryNoteView } from "./DeliveryNoteView.js";
import { InvoiceFromDeliveryView } from "./InvoiceFromDeliveryView.js";
import { MarginOverridesView } from "./MarginOverridesView.js";
import { InventoryView } from "./InventoryView.js";
import { StockAdjustmentView } from "./StockAdjustmentView.js";
import { DealPartView } from "./DealPartView.js";
import { PartyView } from "./PartyView.js";
import { SalesHistoryView } from "./SalesHistoryView.js";
import { AdminSettingsView } from "./AdminSettingsView.js";
import { PurchaseOrderView } from "./PurchaseOrderView.js";
import { GoodsReceiptView } from "./GoodsReceiptView.js";
import { PurchaseInvoiceView } from "./PurchaseInvoiceView.js";
import { PurchaseHistoryView } from "./PurchaseHistoryView.js";
import { SupplierReturnView } from "./SupplierReturnView.js";
import { CarModelsView } from "./CarModelsView.js";
import { StockOrderingView } from "./StockOrderingView.js";
import { AppHeader, accessibleViews, type View } from "./AppHeader.js";
import type { LoginResult } from "./api.js";

export function App() {
  const [user, setUser] = useState<LoginResult | null>(null);
  const [view, setView] = useState<View>("pos");

  // A role might not include "pos" at all (Mehmoon's request, 2026-09-14:
  // role-based module access) — land on whichever view the freshly
  // logged-in user can actually reach, falling back to "pos" only when
  // even that lookup somehow comes up empty (shouldn't happen: admin
  // always gets everything, and a role with zero modules is a real,
  // deliberate "no access" case with nowhere sensible to land anyway).
  function handleLoggedIn(loggedInUser: LoginResult) {
    setUser(loggedInUser);
    setView(accessibleViews(loggedInUser)[0] ?? "pos");
  }

  // Ctrl+H opens Sales History from anywhere in the app, per Mehmoon's
  // request — matches the F1-F9 lookup-shortcut convention already
  // confirmed for this project (CLAUDE.md 5.9). preventDefault() stops
  // the browser's own History page from opening instead; inside Electron
  // this would be registered as a proper accelerator rather than a
  // window keydown listener.
  useEffect(() => {
    if (!user) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.key.toLowerCase() === "h") {
        e.preventDefault();
        setView("sales-history");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [user]);

  // Defensive: if the current view stops being accessible (admin status
  // revoked mid-session, or — since 2026-09-14 — a role's module access
  // narrowed), fall back to the first view this user can still reach
  // rather than leaving a now-hidden screen rendered.
  useEffect(() => {
    if (user && !accessibleViews(user).includes(view)) setView(accessibleViews(user)[0] ?? "pos");
  }, [user, view]);

  if (!user) return <LoginView onLoggedIn={handleLoggedIn} />;

  function handleLogout() {
    setUser(null);
    setView("pos");
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <AppHeader user={user} view={view} onViewChange={setView} onLogout={handleLogout} />
      {view === "pos" && <PosView user={user} />}
      {view === "quotations" && <QuotationView />}
      {view === "delivery-notes" && <DeliveryNoteView />}
      {view === "invoice-from-delivery" && <InvoiceFromDeliveryView />}
      {view === "margin-overrides" && <MarginOverridesView />}
      {view === "inventory" && <InventoryView />}
      {view === "stock-adjustments" && <StockAdjustmentView />}
      {view === "deal-parts" && <DealPartView />}
      {view === "parties" && <PartyView />}
      {view === "sales-history" && <SalesHistoryView />}
      {view === "admin-settings" && <AdminSettingsView />}
      {view === "purchase-orders" && <PurchaseOrderView />}
      {view === "goods-receipts" && <GoodsReceiptView />}
      {view === "purchase-invoices" && <PurchaseInvoiceView />}
      {view === "purchase-history" && <PurchaseHistoryView />}
      {view === "supplier-returns" && <SupplierReturnView />}
      {view === "car-models" && <CarModelsView />}
      {view === "stock-ordering" && <StockOrderingView />}
    </div>
  );
}
