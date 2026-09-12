import { date, numeric, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { idColumn, timestampColumns } from "./_helpers.js";
import { users } from "./users.js";
import { salesDocuments } from "./sales-documents.js";
import { purchaseDocuments } from "./purchase-documents.js";

/**
 * Settlement channels (CLAUDE.md 5.10: "Cash, EasyPaisa, JazzCash, Bank
 * Transfer, each posting to its own chart-of-accounts account"). Built
 * 2026-09-12, once the Party Statement (built the day before) made the
 * gap concrete: "total invoiced/billed" couldn't become a real
 * outstanding balance without a real payment record to subtract.
 *
 * Deliberately a narrower thing than the Vouchers module (CLAUDE.md
 * section 8, "not built yet") — this ties a payment directly to ONE
 * sales or purchase Invoice, not a free-floating Bank/Cash Receipt or
 * Payment voucher with its own document number and print format. A
 * proper Voucher is still a real, separate future need; this is the
 * minimum real thing that lets a document's paid/unpaid status and a
 * party's balance be genuinely correct today.
 *
 * `[unclear — confirm]` whether a single sale can split across multiple
 * channels (CLAUDE.md 5.10 flags this directly) — resolved here by NOT
 * needing an answer: a document can have any number of settlement rows,
 * each its own channel and amount, so a split payment is just multiple
 * rows rather than one row needing to reference several channels at
 * once.
 *
 * Deliberately NOT built in this pass: any actual posting to the chart
 * of accounts (Cash in Hand / Easypaisa Account / Jazz Cash Account /
 * a specific bank account) — the ledger/journal module (CLAUDE.md
 * section 8, Phase 4) doesn't exist yet, so `channel` here is a plain
 * label, not a posted account movement. Same "don't build ahead of the
 * accounting module" reasoning already applied to Purchase Invoice and
 * checkout, neither of which post to the chart of accounts either.
 * Overpayment (settlements summing past the document total) is NOT
 * blocked — nothing in the client's notes says whether that's a real
 * scenario (an advance/deposit) or always a data-entry error, so no
 * business rule is invented either way, same precedent as not blocking
 * negative stock.
 */
export const settlementChannelEnum = pgEnum("settlement_channel", [
  "cash",
  "easypaisa",
  "jazzcash",
  "bank_transfer",
]);

export const settlements = pgTable("settlements", {
  ...idColumn,
  // Exactly one of these two is set, enforced at the application layer
  // (same pattern as sales_document_lines' controlPartId/dealPartId) — a
  // settlement against a sales Invoice is money received; against a
  // Purchase Invoice, money paid out. There's no third case.
  salesDocumentId: uuid("sales_document_id").references(() => salesDocuments.id),
  purchaseDocumentId: uuid("purchase_document_id").references(() => purchaseDocuments.id),
  channel: settlementChannelEnum("channel").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  paymentDate: date("payment_date").notNull(),
  // Free text for whatever the channel needs — an EasyPaisa/JazzCash
  // transaction ID, a cheque number, a bank reference. Not required:
  // plain Cash has nothing to reference.
  referenceNote: text("reference_note"),
  ...timestampColumns,
  createdBy: uuid("created_by").references(() => users.id),
  updatedBy: uuid("updated_by").references(() => users.id),
});
