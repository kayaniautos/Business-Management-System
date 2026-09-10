import { eq, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { documentNumberCounters } from "../../db/schema/documents.js";
import { legalEntities } from "../../db/schema/entities.js";

// Accepts either the top-level db handle or a transaction handle from
// db.transaction(async (tx) => ...) — a plain `typeof db` param type
// rejects `tx` because the transaction object lacks db's `$client`
// property, even though it supports every query method used here.
type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * First real use of document_number_counters (CLAUDE.md 3.1) — nothing
 * assigned a real document number before this. Atomic via a single
 * INSERT ... ON CONFLICT DO UPDATE ... RETURNING, relying on the unique
 * (legal_entity_id, document_type) index already on that table — Postgres
 * serializes concurrent writers on the same row, so no explicit
 * SELECT ... FOR UPDATE is needed for a single local Postgres instance.
 *
 * [unclear — confirm] This does NOT solve the multi-terminal-offline
 * collision risk already flagged on that table's schema comment — this
 * project only has one terminal so far, so that risk isn't exercised yet,
 * but don't assume this function is safe once a second terminal exists.
 *
 * No short-code field exists on `legal_entities` (just `name`), so the
 * entity code used in the printed number is a small hardcoded lookup here
 * rather than a schema column — flagging as an assumption, not a
 * confirmed numbering scheme (CLAUDE.md's own open question: "chart of
 * accounts coding should be expansion-ready... no numbering scheme
 * provided" applies just as much to document numbers).
 */
const ENTITY_CODES: Record<string, string> = {
  "Kiyan Traders": "KT",
  "Kiyani Autos": "KA",
};

const DOCUMENT_TYPE_CODES: Record<string, string> = {
  quotation: "QTN",
  delivery_note: "DN",
  invoice: "INV",
  purchase_order: "PO",
  goods_receipt: "GRN",
  purchase_invoice: "PINV",
};

export async function assignDocumentNumber(
  legalEntityId: string,
  documentType: string,
  client: DbOrTx = db,
): Promise<string> {
  const entity = await client.query.legalEntities.findFirst({
    where: eq(legalEntities.id, legalEntityId),
  });
  if (!entity) throw new Error(`Unknown legal entity: ${legalEntityId}`);

  const [counter] = await client
    .insert(documentNumberCounters)
    .values({ legalEntityId, documentType, lastNumber: 1 })
    .onConflictDoUpdate({
      target: [
        documentNumberCounters.legalEntityId,
        documentNumberCounters.documentType,
      ],
      set: { lastNumber: sql`${documentNumberCounters.lastNumber} + 1` },
    })
    .returning({ lastNumber: documentNumberCounters.lastNumber });

  const entityCode = ENTITY_CODES[entity.name] ?? entity.name.slice(0, 2).toUpperCase();
  const typeCode = DOCUMENT_TYPE_CODES[documentType] ?? documentType.slice(0, 3).toUpperCase();
  const padded = String(counter.lastNumber).padStart(4, "0");

  return `${entityCode}-${typeCode}-${padded}`;
}
