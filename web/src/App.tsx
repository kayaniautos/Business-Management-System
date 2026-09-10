import { useEffect, useState } from "react";
import { LoginView } from "./LoginView.js";
import { PosView } from "./PosView.js";
import { QuotationView } from "./QuotationView.js";
import { DeliveryNoteView } from "./DeliveryNoteView.js";
import { InventoryView } from "./InventoryView.js";
import { StockAdjustmentView } from "./StockAdjustmentView.js";
import { DealPartView } from "./DealPartView.js";
import { PartyView } from "./PartyView.js";
import { SalesHistoryView } from "./SalesHistoryView.js";
import { AdminSettingsView } from "./AdminSettingsView.js";
import { AppHeader, type View } from "./AppHeader.js";
import type { LoginResult } from "./api.js";

export function App() {
  const [user, setUser] = useState<LoginResult | null>(null);
  const [view, setView] = useState<View>("pos");

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

  // Defensive: if admin status is revoked while this screen is open
  // (e.g. an admin revoking their own access), fall back to POS rather
  // than leaving a now-hidden view rendered.
  useEffect(() => {
    if (user && !user.isAdmin && view === "admin-settings") setView("pos");
  }, [user, view]);

  if (!user) return <LoginView onLoggedIn={setUser} />;

  function handleLogout() {
    setUser(null);
    setView("pos");
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <AppHeader user={user} view={view} onViewChange={setView} onLogout={handleLogout} />
      {view === "pos" && <PosView user={user} />}
      {view === "quotations" && <QuotationView />}
      {view === "delivery-notes" && <DeliveryNoteView />}
      {view === "inventory" && <InventoryView />}
      {view === "stock-adjustments" && <StockAdjustmentView />}
      {view === "deal-parts" && <DealPartView />}
      {view === "parties" && <PartyView />}
      {view === "sales-history" && <SalesHistoryView />}
      {view === "admin-settings" && <AdminSettingsView />}
    </div>
  );
}
