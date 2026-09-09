import { useState } from "react";
import { LoginView } from "./LoginView.js";
import { PosView } from "./PosView.js";
import type { LoginResult } from "./api.js";

export function App() {
  const [user, setUser] = useState<LoginResult | null>(null);

  if (!user) return <LoginView onLoggedIn={setUser} />;
  return <PosView user={user} />;
}
