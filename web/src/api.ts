export interface LoginResult {
  id: string;
  username: string;
  fullName: string;
  roles: string[];
}

export interface PartSearchResult {
  id: string;
  partNumber: string;
  name: string;
  itemName: string | null;
  markerName: string | null;
  fitment: { make: string; model: string }[];
}

export async function login(username: string, pin: string): Promise<LoginResult> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, pin }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "Login failed");
  return body as LoginResult;
}

export async function searchParts(q: string): Promise<PartSearchResult[]> {
  const res = await fetch(`/api/parts/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error("Search failed");
  return (await res.json()) as PartSearchResult[];
}
