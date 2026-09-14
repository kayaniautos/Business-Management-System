import { sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { itemCodeCounters } from "../../db/schema/inventory.js";

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

const COUNTER_ID = "item";

/**
 * Item Code generator (Form A field (a), CLAUDE.md 5.1: "auto-generated
 * ... explicitly noted as a future barcode candidate"). All-digits,
 * zero-padded to 6 (naturally grows past that, no hard cap), same
 * atomic INSERT ... ON CONFLICT DO UPDATE ... RETURNING pattern as
 * `assignDocumentNumber` (services/document-numbers.ts) — one shop-wide
 * counter, not split by legal entity, since the inventory pool itself
 * isn't entity-split (CLAUDE.md 4.4).
 */
export async function assignItemCode(client: DbOrTx = db): Promise<string> {
  const [counter] = await client
    .insert(itemCodeCounters)
    .values({ id: COUNTER_ID, lastNumber: 1 })
    .onConflictDoUpdate({
      target: itemCodeCounters.id,
      set: { lastNumber: sql`${itemCodeCounters.lastNumber} + 1` },
    })
    .returning({ lastNumber: itemCodeCounters.lastNumber });

  return String(counter.lastNumber).padStart(6, "0");
}
