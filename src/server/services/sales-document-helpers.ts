import { eq, inArray } from "drizzle-orm";
import { db } from "../../db/client.js";
import { controlParts, legalEntities, parties } from "../../db/schema/index.js";

/**
 * Shared validation + line math for the sales document chain (checkout
 * and quotation creation both need this identical logic - CLAUDE.md 5.9's
 * "build once as shared behavior" instruction, applied to the backend
 * this time rather than just the schema). Kept as plain functions, not a
 * class, since each is used independently.
 */

export interface SalesLineInput {
  controlPartId: string;
  quantity: number;
  unitGrossPrice: number;
}

export interface SalesDiscountInput {
  label: string;
  amount: number;
}

export class SalesDocumentValidationError extends Error {}

export async function requireLegalEntity(legalEntityId: string) {
  const entity = await db.query.legalEntities.findFirst({
    where: eq(legalEntities.id, legalEntityId),
  });
  if (!entity) throw new SalesDocumentValidationError("Unknown legal entity");
  return entity;
}

/** Returns the party's GST/NTN for snapshotting onto the document header. */
export async function snapshotPartyTaxInfo(partyId: string | undefined) {
  if (!partyId) return { customerGstNo: undefined, customerNtnNo: undefined };
  const party = await db.query.parties.findFirst({ where: eq(parties.id, partyId) });
  if (!party) throw new SalesDocumentValidationError("Unknown party");
  return { customerGstNo: party.gstNo ?? undefined, customerNtnNo: party.ntnNo ?? undefined };
}

export async function requireControlPartsExist(lines: SalesLineInput[]) {
  const partIds = [...new Set(lines.map((l) => l.controlPartId))];
  const found = await db
    .select({ id: controlParts.id })
    .from(controlParts)
    .where(inArray(controlParts.id, partIds));
  if (found.length !== partIds.length) {
    throw new SalesDocumentValidationError("One or more parts were not found");
  }
}

/**
 * Discounts are Kiyani Autos-only, flat amount, max 2 (CLAUDE.md 5.10,
 * confirmed 2026-09-08). The max-2 cap is enforced by the caller's Zod
 * schema; this checks the entity restriction and that the sale doesn't go
 * negative.
 */
export function computeAndValidateTotals(
  entityName: string,
  lines: SalesLineInput[],
  discounts: SalesDiscountInput[],
) {
  if (discounts.length > 0 && entityName !== "Kiyani Autos") {
    throw new SalesDocumentValidationError(
      "Discounts are only available for Kiyani Autos sales",
    );
  }

  const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.unitGrossPrice, 0);
  const discountTotal = discounts.reduce((sum, d) => sum + d.amount, 0);
  const total = subtotal - discountTotal;
  if (total < 0) {
    throw new SalesDocumentValidationError("Discount exceeds the sale total");
  }

  return { subtotal, discountTotal, total };
}
