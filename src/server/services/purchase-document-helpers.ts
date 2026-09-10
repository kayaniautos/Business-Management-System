import { eq, inArray } from "drizzle-orm";
import { db } from "../../db/client.js";
import { controlParts, parties } from "../../db/schema/index.js";

/**
 * Shared validation + line math for the purchase document chain (Purchase
 * Order, Goods Receipt, Purchase Invoice creation all need this identical
 * logic) — same "build once as shared behavior" reasoning as
 * sales-document-helpers.ts, kept as a separate file rather than merged
 * into it since purchase lines/parties have real shape differences (no
 * Deal Part reference, no discounts, a required supplier instead of an
 * optional walk-in customer).
 */

export interface PurchaseLineInput {
  controlPartId: string;
  quantity: number;
  unitCost: number;
}

export class PurchaseDocumentValidationError extends Error {}

/** Re-exported for convenience so callers only import from one place. */
export { requireLegalEntity } from "./sales-document-helpers.js";

export async function requireSupplierParty(partyId: string) {
  const party = await db.query.parties.findFirst({ where: eq(parties.id, partyId) });
  if (!party) throw new PurchaseDocumentValidationError("Unknown supplier");
  return party;
}

export async function requirePurchasePartsExist(lines: PurchaseLineInput[]) {
  const partIds = [...new Set(lines.map((l) => l.controlPartId))];
  const found = await db
    .select({ id: controlParts.id })
    .from(controlParts)
    .where(inArray(controlParts.id, partIds));
  if (found.length !== partIds.length) {
    throw new PurchaseDocumentValidationError("One or more parts were not found");
  }
}

export function computePurchaseTotals(lines: PurchaseLineInput[]) {
  const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.unitCost, 0);
  return { subtotal, total: subtotal };
}
