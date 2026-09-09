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

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "Request failed");
  return body as T;
}

async function postJson<T>(url: string, payload: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = res.status === 204 ? null : await res.json();
  if (!res.ok) throw new Error((body as { error?: string } | null)?.error ?? "Request failed");
  return body as T;
}

export interface Marker {
  id: string;
  name: string;
  description: string | null;
}

export interface InventoryItem {
  id: string;
  name: string;
  description: string | null;
  markerId: string | null;
}

export interface ControlPart {
  id: string;
  partNumber: string;
  name: string;
  description: string | null;
  itemId: string | null;
  parentControlPartId: string | null;
  parentPartNumber: string | null;
  fitment: { id: string; make: string; model: string }[];
}

export interface CarModel {
  id: string;
  make: string;
  model: string;
  yearFrom: number | null;
  yearTo: number | null;
}

export const getMarkers = () => getJson<Marker[]>("/api/inventory/markers");
export const createMarker = (name: string) =>
  postJson<Marker>("/api/inventory/markers", { name });

export const getItems = (markerId?: string) =>
  getJson<InventoryItem[]>(`/api/inventory/items${markerId ? `?markerId=${markerId}` : ""}`);
export const createItem = (name: string, markerId: string) =>
  postJson<InventoryItem>("/api/inventory/items", { name, markerId });

export const getControlParts = (itemId?: string) =>
  getJson<ControlPart[]>(`/api/inventory/control-parts${itemId ? `?itemId=${itemId}` : ""}`);
export const createControlPart = (
  partNumber: string,
  name: string,
  itemId: string,
  parentControlPartId?: string,
) =>
  postJson<ControlPart>("/api/inventory/control-parts", {
    partNumber,
    name,
    itemId,
    parentControlPartId,
  });

export const getCarModels = () => getJson<CarModel[]>("/api/inventory/car-models");
export const createCarModel = (make: string, model: string) =>
  postJson<CarModel>("/api/inventory/car-models", { make, model });

export const attachFitment = (controlPartId: string, carModelId: string) =>
  postJson<null>(`/api/inventory/control-parts/${controlPartId}/fitment`, { carModelId });

export async function detachFitment(controlPartId: string, carModelId: string): Promise<void> {
  const res = await fetch(`/api/inventory/control-parts/${controlPartId}/fitment/${carModelId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Could not remove fitment");
}

export async function checkout(
  legalEntityId: string,
  lines: CheckoutLine[],
  discounts: CheckoutDiscount[],
  partyId?: string,
): Promise<CheckoutResult> {
  const res = await fetch("/api/sales/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ legalEntityId, partyId, lines, discounts }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "Checkout failed");
  return body as CheckoutResult;
}

export type PartyStatus = "C1" | "C2" | "C3";
export type PartyNature = "S1" | "S2" | "S3";

export interface Party {
  id: string;
  name: string;
  printName: string | null;
  gstNo: string | null;
  ntnNo: string | null;
  status: PartyStatus;
  nature: PartyNature;
  phoneNumbers: string[];
}

export const getParties = (opts?: { q?: string; nature?: PartyNature }) => {
  const params = new URLSearchParams();
  if (opts?.q) params.set("q", opts.q);
  if (opts?.nature) params.set("nature", opts.nature);
  const qs = params.toString();
  return getJson<Party[]>(`/api/parties${qs ? `?${qs}` : ""}`);
};

export const createParty = (party: {
  name: string;
  status: PartyStatus;
  nature: PartyNature;
  gstNo?: string;
  ntnNo?: string;
  phoneNumbers: string[];
}) => postJson<Party>("/api/parties", party);

export interface SalesDocumentSummary {
  id: string;
  documentType: string;
  documentNumber: string;
  entityName: string;
  partyName: string | null;
  documentDate: string;
  subtotalAmount: string;
  discountTotal: string;
  totalAmount: string;
  status: string;
}

export interface SalesDocumentDetail extends SalesDocumentSummary {
  lines: {
    lineNumber: number;
    partNumber: string;
    catalogName: string;
    displayName: string | null;
    quantity: number;
    unitGrossPrice: string;
    lineGrossAmount: string;
  }[];
  discounts: { label: string; amount: string }[];
}

export const getSalesHistory = (opts?: { legalEntityId?: string; q?: string }) => {
  const params = new URLSearchParams();
  if (opts?.legalEntityId) params.set("legalEntityId", opts.legalEntityId);
  if (opts?.q) params.set("q", opts.q);
  const qs = params.toString();
  return getJson<SalesDocumentSummary[]>(`/api/sales${qs ? `?${qs}` : ""}`);
};

export const getSalesDocument = (id: string) => getJson<SalesDocumentDetail>(`/api/sales/${id}`);
