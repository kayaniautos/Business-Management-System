import { eq, inArray } from "drizzle-orm";
import { db } from "../../db/client.js";
import { controlParts, dealParts, legalEntities, parties } from "../../db/schema/index.js";

/**
 * Shared validation + line math for the sales document chain (checkout
 * and quotation creation both need this identical logic - CLAUDE.md 5.9's
 * "build once as shared behavior" instruction, applied to the backend
 * this time rather than just the schema). Kept as plain functions, not a
 * class, since each is used independently.
 */

export interface SalesLineInput {
  // Exactly one of these two is set per line — enforced by the caller's
  // Zod schema (checkoutLineSchema in sales.ts is the only one that
  // actually allows dealPartId; Quotation/DN still only accept
  // controlPartId, so this stays optional here without changing their
  // behavior).
  controlPartId?: string;
  dealPartId?: string;
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

/**
 * Validates that every line's reference actually exists — a control part
 * for a regular line, a Deal Part (CLAUDE.md 5.4) for a bundle line. Also
 * rejects a line carrying neither or both references, since the schemas
 * that allow dealPartId (checkoutLineSchema) enforce "exactly one" via
 * Zod but this is the one place shared by every caller, including ones
 * whose own schema doesn't have dealPartId at all.
 */
export async function requireControlPartsExist(lines: SalesLineInput[]) {
  for (const line of lines) {
    if (Boolean(line.controlPartId) === Boolean(line.dealPartId)) {
      throw new SalesDocumentValidationError(
        "Each line must reference exactly one part or deal part",
      );
    }
  }

  const partIds = [...new Set(lines.filter((l) => l.controlPartId).map((l) => l.controlPartId!))];
  if (partIds.length > 0) {
    const found = await db
      .select({ id: controlParts.id })
      .from(controlParts)
      .where(inArray(controlParts.id, partIds));
    if (found.length !== partIds.length) {
      throw new SalesDocumentValidationError("One or more parts were not found");
    }
  }

  const dealPartIds = [...new Set(lines.filter((l) => l.dealPartId).map((l) => l.dealPartId!))];
  if (dealPartIds.length > 0) {
    const found = await db
      .select({ id: dealParts.id })
      .from(dealParts)
      .where(inArray(dealParts.id, dealPartIds));
    if (found.length !== dealPartIds.length) {
      throw new SalesDocumentValidationError("One or more deal parts were not found");
    }
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
