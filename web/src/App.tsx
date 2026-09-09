import { useState } from "react";
import { LoginView } from "./LoginView.js";
import { PosView } from "./PosView.js";
import { InventoryView } from "./InventoryView.js";
import { AppHeader, type View } from "./AppHeader.js";
import type { LoginResult } from "./api.js";

export function App() {
  const [user, setUser] = useState<LoginResult | null>(null);
  const [view, setView] = useState<View>("pos");

  if (!user) return <LoginView onLoggedIn={setUser} />;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <AppHeader user={user} view={view} onViewChange={setView} />
      {view === "pos" ? <PosView user={user} /> : <InventoryView />}
    </div>
  );
}
