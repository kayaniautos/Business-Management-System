import { useEffect, useState } from "react";
import { LoginView } from "./LoginView.js";
import { PosView } from "./PosView.js";
import { QuotationView } from "./QuotationView.js";
import { DeliveryNoteView } from "./DeliveryNoteView.js";
import { InventoryView } from "./InventoryView.js";
import { PartyView } from "./PartyView.js";
import { SalesHistoryView } from "./SalesHistoryView.js";
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

  if (!user) return <LoginView onLoggedIn={setUser} />;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <AppHeader user={user} view={view} onViewChange={setView} />
      {view === "pos" && <PosView user={user} />}
      {view === "quotations" && <QuotationView />}
      {view === "delivery-notes" && <DeliveryNoteView />}
      {view === "inventory" && <InventoryView />}
      {view === "parties" && <PartyView />}
      {view === "sales-history" && <SalesHistoryView />}
    </div>
  );
}
