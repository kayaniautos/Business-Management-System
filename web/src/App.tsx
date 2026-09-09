import { useState } from "react";
import { LoginView } from "./LoginView.js";
import { PartsSearchView } from "./PartsSearchView.js";
import type { LoginResult } from "./api.js";

export function App() {
  const [user, setUser] = useState<LoginResult | null>(null);

  if (!user) return <LoginView onLoggedIn={setUser} />;
  return <PartsSearchView user={user} />;
}
