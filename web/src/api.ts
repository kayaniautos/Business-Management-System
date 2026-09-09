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

export interface StaffMember {
  id: string;
  username: string;
  fullName: string;
  roles: string[];
}

export async function getStaff(): Promise<StaffMember[]> {
  const res = await fetch("/api/auth/staff");
  if (!res.ok) throw new Error("Could not load staff list");
  return (await res.json()) as StaffMember[];
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

export interface LegalEntity {
  id: string;
  name: string;
}

export async function getEntities(): Promise<LegalEntity[]> {
  const res = await fetch("/api/entities");
  if (!res.ok) throw new Error("Could not load entities");
  return (await res.json()) as LegalEntity[];
}

export interface CheckoutLine {
  controlPartId: string;
  quantity: number;
  unitGrossPrice: number;
  displayName?: string;
}

export interface CheckoutDiscount {
  label: string;
  amount: number;
}

export interface CheckoutResult {
  id: string;
  documentNumber: string;
  subtotalAmount: string;
  discountTotal: string;
  totalAmount: string;
}

export async function checkout(
  legalEntityId: string,
  lines: CheckoutLine[],
  discounts: CheckoutDiscount[],
): Promise<CheckoutResult> {
  const res = await fetch("/api/sales/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ legalEntityId, lines, discounts }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "Checkout failed");
  return body as CheckoutResult;
}
