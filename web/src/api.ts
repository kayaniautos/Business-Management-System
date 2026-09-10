export interface LoginResult {
  id: string;
  username: string;
  fullName: string;
  roles: string[];
  isAdmin: boolean;
}

export interface PartSearchResult {
  id: string;
  // Null when isDealPart is true — bundles have no part number.
  partNumber: string | null;
  name: string;
  itemName: string | null;
  markerName: string | null;
  fitment: { make: string; model: string }[];
  isDealPart: boolean;
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

export async function adminLogin(identifier: string, password: string): Promise<LoginResult> {
  const res = await fetch("/api/auth/admin-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "Admin login failed");
  return body as LoginResult;
}

export async function searchParts(
  q: string,
  opts?: { includeDealParts?: boolean; carModelId?: string },
): Promise<PartSearchResult[]> {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (opts?.includeDealParts) params.set("includeDealParts", "true");
  if (opts?.carModelId) params.set("carModelId", opts.carModelId);
  const res = await fetch(`/api/parts/search?${params.toString()}`);
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
  // Exactly one of these two — Quotation/DN never send dealPartId (their
  // backend routes don't accept it), only POS checkout does.
  controlPartId?: string;
  dealPartId?: string;
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

async function putJson<T>(url: string, payload: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "PUT",
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

// Shared label formatter — used by both the Inventory fitment picker and
// POS's Make/Model fitment search, so a model generation reads the same
// way ("Corolla (2009-2016)") everywhere it's picked from a list. The
// year range is the disambiguator between generations of the same model
// (handover doc §6.2's "by vehicle model + year range"), so it's baked
// into the label itself rather than a separate year field the staff has
// to reconcile against.
export function carModelLabel(c: CarModel): string {
  if (c.yearFrom && c.yearTo) return `${c.model} (${c.yearFrom}-${c.yearTo})`;
  if (c.yearFrom) return `${c.model} (${c.yearFrom}+)`;
  return c.model;
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
export const createCarModel = (make: string, model: string, yearFrom?: number, yearTo?: number) =>
  postJson<CarModel>("/api/inventory/car-models", { make, model, yearFrom, yearTo });

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
  partyId: string | null;
  lines: {
    lineNumber: number;
    // Exactly one of these two is set — null for the other. Only a
    // checkout-created Invoice can currently have a dealPartId line;
    // Quotation/DN lines always have controlPartId.
    controlPartId: string | null;
    dealPartId: string | null;
    // Null only for a Deal Part line.
    partNumber: string | null;
    // Always present: catalog part name, or the Deal Part's print name.
    catalogName: string;
    displayName: string | null;
    quantity: number;
    unitGrossPrice: string;
    lineGrossAmount: string;
  }[];
  discounts: { label: string; amount: string }[];
}

export type SalesDocumentType = "quotation" | "delivery_note" | "invoice";

export const getSalesHistory = (opts?: { legalEntityId?: string; q?: string; documentType?: SalesDocumentType }) => {
  const params = new URLSearchParams();
  if (opts?.legalEntityId) params.set("legalEntityId", opts.legalEntityId);
  if (opts?.q) params.set("q", opts.q);
  if (opts?.documentType) params.set("documentType", opts.documentType);
  const qs = params.toString();
  return getJson<SalesDocumentSummary[]>(`/api/sales${qs ? `?${qs}` : ""}`);
};

export const getSalesDocument = (id: string) => getJson<SalesDocumentDetail>(`/api/sales/${id}`);

export const postSalesDocument = (id: string) => postJson<SalesDocumentSummary>(`/api/sales/${id}/post`, {});
export const unpostSalesDocument = (id: string) => postJson<SalesDocumentSummary>(`/api/sales/${id}/unpost`, {});

export interface QuotationInput {
  legalEntityId: string;
  partyId?: string;
  customerRef?: string;
  ourRefNo?: string;
  vehicleDetails?: string;
  poNo?: string;
  validUntil?: string;
  lines: CheckoutLine[];
  discounts: CheckoutDiscount[];
}

export const createQuotation = (input: QuotationInput) =>
  postJson<CheckoutResult>("/api/quotations", input);

export interface DeliveryNoteInput {
  legalEntityId: string;
  partyId?: string;
  customerRef?: string;
  ourRefNo?: string;
  vehicleDetails?: string;
  poNo?: string;
  sourceQuotationId?: string;
  lines: CheckoutLine[];
  discounts: CheckoutDiscount[];
}

export const createDeliveryNote = (input: DeliveryNoteInput) =>
  postJson<CheckoutResult>("/api/delivery-notes", input);

export interface StockAdjustment {
  id: string;
  controlPartId: string;
  partNumber: string;
  partName: string;
  quantityDelta: number;
  reasonComment: string;
  createdAt: string;
}

export interface StockAdjustmentResult extends StockAdjustment {
  quantityAfter: number;
}

export const getPartQuantity = (controlPartId: string) =>
  getJson<{ controlPartId: string; quantity: number }>(
    `/api/stock-adjustments/quantity/${controlPartId}`,
  );

export const getStockAdjustments = (q?: string) =>
  getJson<StockAdjustment[]>(
    `/api/stock-adjustments${q ? `?q=${encodeURIComponent(q)}` : ""}`,
  );

export const createStockAdjustment = (input: {
  controlPartId: string;
  quantityDelta: number;
  reasonComment: string;
}) => postJson<StockAdjustmentResult>("/api/stock-adjustments", input);

export interface DealPart {
  id: string;
  printName: string;
  description: string | null;
  components: { controlPartId: string; partNumber: string; name: string; quantity: number }[];
}

export const getDealParts = (q?: string) =>
  getJson<DealPart[]>(`/api/deal-parts${q ? `?q=${encodeURIComponent(q)}` : ""}`);

export const createDealPart = (input: {
  printName: string;
  description?: string;
  components: { controlPartId: string; quantity: number }[];
}) => postJson<DealPart>("/api/deal-parts", input);

export interface Role {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
}

export const getRoles = () => getJson<Role[]>("/api/admin/roles");
export const createRole = (input: { name: string; description?: string }) =>
  postJson<Role>("/api/admin/roles", input);

export interface AdminUser {
  id: string;
  username: string;
  fullName: string;
  phone: string | null;
  isActive: boolean;
  // Email or phone number, used as the admin login identifier.
  adminIdentifier: string | null;
  isAdmin: boolean;
  roles: { id: string; name: string }[];
}

export const getAdminUsers = () => getJson<AdminUser[]>("/api/admin/users");

export const createAdminUser = (input: {
  username: string;
  fullName: string;
  phone?: string;
  pin: string;
  roleIds: string[];
}) => postJson<AdminUser>("/api/admin/users", input);

export const setUserRoles = (userId: string, roleIds: string[]) =>
  putJson<AdminUser>(`/api/admin/users/${userId}/roles`, { roleIds });

export const grantAdmin = (userId: string, identifier: string, password: string) =>
  postJson<AdminUser>(`/api/admin/users/${userId}/grant-admin`, { identifier, password });
export const revokeAdmin = (userId: string) =>
  postJson<AdminUser>(`/api/admin/users/${userId}/revoke-admin`, {});

export const deactivateUser = (userId: string) =>
  postJson<AdminUser>(`/api/admin/users/${userId}/deactivate`, {});
export const activateUser = (userId: string) =>
  postJson<AdminUser>(`/api/admin/users/${userId}/activate`, {});
