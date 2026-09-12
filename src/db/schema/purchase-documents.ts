import {
  date,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { idColumn, timestampColumns } from "./_helpers.js";
import { users } from "./users.js";
import { legalEntities } from "./entities.js";
import { parties } from "./parties.js";
import { controlParts } from "./inventory.js";

/**
 * Purchase document chain per CLAUDE.md section 7 / handover doc 6.3:
 *   Purchase Order -> Goods Receipt (an internal memo/delivery challan) ->
 *   Purchase Invoice (the supplier's actual bill, reconciled against one
 *   or more receipts once it arrives).
 *
 * Modeled as one shared header table with a `documentType` discriminator,
 * same reasoning as sales_documents: the three share almost every field
 * (supplier, entity, dates, totals), so this is genuinely shared behavior,
 * not a premature abstraction.
 *
 * Unlike sales_documents, `partyId` here is NOT NULL — a purchase always
 * has a known supplier (Nature S1/S2 party), there's no "walk-in supplier"
 * equivalent to a walk-in retail customer.
 *
 * Deliberately NOT built in this pass:
 * - Supplier Payable ledger posting — CLAUDE.md's own accounting/ledger
 *   module (Phase 4, section 8) doesn't exist yet; no sales document posts
 *   to the chart of accounts either, so this isn't a purchasing-specific
 *   gap. A Purchase Invoice here records the transaction and its total,
 *   nothing more.
 * - Merging MULTIPLE goods receipts onto one Purchase Invoice (handover
 *   doc 6.3 explicitly asks for this) — first pass only supports invoicing
 *   from ONE goods receipt at a time, matching this project's own
 *   precedent of building the single-source case first (Delivery Note's
 *   "from Quotation" started the same way). `[unclear — confirm]` when
 *   multi-receipt merging is actually needed vs. one-invoice-per-receipt
 *   being good enough in practice.
 * - Tax computation on the purchase side — `taxTotal` exists to hold a
 *   future result, always 0 for now, same reasoning as sales_documents.
 *
 * `"supplier_return"` added 2026-09-12 (handover doc 6.3: "a ledger entry
 * linked back to the original purchase voucher, not a free-floating
 * credit note") — reuses this same header/lines/links trio rather than a
 * separate table, since a return shares the exact same shape (supplier,
 * entity, lines of controlPartId/quantity/unitCost, a real stock effect
 * needing post/unpost). The "linked back to the original voucher" part is
 * literal: a return always requires a `purchase_document_links` row back
 * to the specific posted Goods Receipt it's returning against — see
 * src/server/routes/supplier-returns.ts. Still NOT a ledger entry in the
 * accounting sense (no chart-of-accounts posting) — the ledger module
 * doesn't exist yet, same reasoning as the rest of this file.
 */
export const purchaseDocumentTypeEnum = pgEnum("purchase_document_type", [
  "purchase_order",
  "goods_receipt",
  "purchase_invoice",
  "supplier_return",
]);

/**
 * Post/Unpost (CLAUDE.md 5.9) applies to Goods Receipt and Supplier
 * Return — both have a real stock effect that needs to be reversible. A
 * Purchase Order is informational (nothing has arrived yet, no stock
 * effect) and a Purchase Invoice is created already "posted" (the
 * supplier's bill arriving IS the finalizing event) with no further
 * stock effect of its own, since the Goods Receipt it's raised from
 * already moved stock when that receipt was posted. See purchases.ts for
 * where each type is allowed/blocked from posting.
 */
export const purchaseDocumentStatusEnum = pgEnum("purchase_document_status", [
  "draft",
  "posted",
  "unposted",
]);

export const purchaseDocuments = pgTable("purchase_documents", {
  ...idColumn,
  documentType: purchaseDocumentTypeEnum("document_type").notNull(),
  documentNumber: varchar("document_number", { length: 50 }).notNull(),
  legalEntityId: uuid("legal_entity_id")
    .notNull()
    .references(() => legalEntities.id),
  // The supplier (Party Form, Nature S1/S2) — required, unlike
  // sales_documents.partyId, since a purchase always has a known vendor.
  partyId: uuid("party_id")
    .notNull()
    .references(() => parties.id),
  // The supplier's own document number for this transaction — their
  // delivery challan number on a Goods Receipt, their invoice number on a
  // Purchase Invoice. Free text, not a foreign key, since it identifies a
  // document in the SUPPLIER's own system, not this one (CLAUDE.md
  // section 7: "recorded against an internal memo/delivery challan,
  // reconciled later when the actual invoice arrives").
  supplierRef: varchar("supplier_ref", { length: 100 }),
  documentDate: date("document_date").notNull(),
  subtotalAmount: numeric("subtotal_amount", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  taxTotal: numeric("tax_total", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  totalAmount: numeric("total_amount", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  status: purchaseDocumentStatusEnum("status").notNull().default("draft"),
  postedAt: timestamp("posted_at", { withTimezone: true }),
  ...timestampColumns,
  createdBy: uuid("created_by").references(() => users.id),
  updatedBy: uuid("updated_by").references(() => users.id),
});

/**
 * Same many-to-many chain-link shape as sales_document_links, for the
 * same reason: a Goods Receipt can be a partial delivery against one
 * Purchase Order (CLAUDE.md section 7: "delivery challans support partial
 * deliveries against a single order"), so more than one Goods Receipt can
 * legitimately link back to the same Purchase Order.
 */
export const purchaseDocumentLinks = pgTable(
  "purchase_document_links",
  {
    ...idColumn,
    fromDocumentId: uuid("from_document_id")
      .notNull()
      .references(() => purchaseDocuments.id),
    toDocumentId: uuid("to_document_id")
      .notNull()
      .references(() => purchaseDocuments.id),
    ...timestampColumns,
    createdBy: uuid("created_by").references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id),
  },
  (table) => [
    uniqueIndex("purchase_document_links_from_to_unique").on(
      table.fromDocumentId,
      table.toDocumentId,
    ),
  ],
);

/**
 * Line items. `controlPartId` is required (not nullable) — unlike
 * sales_document_lines, a purchase never buys a Deal Part bundle, only
 * real stockable parts, so there's no second nullable reference here.
 */
export const purchaseDocumentLines = pgTable("purchase_document_lines", {
  ...idColumn,
  purchaseDocumentId: uuid("purchase_document_id")
    .notNull()
    .references(() => purchaseDocuments.id, { onDelete: "cascade" }),
  lineNumber: integer("line_number").notNull(),
  controlPartId: uuid("control_part_id")
    .notNull()
    .references(() => controlParts.id),
  quantity: integer("quantity").notNull(),
  unitCost: numeric("unit_cost", { precision: 14, scale: 2 }).notNull(),
  lineAmount: numeric("line_amount", { precision: 14, scale: 2 }).notNull(),
  ...timestampColumns,
  createdBy: uuid("created_by").references(() => users.id),
  updatedBy: uuid("updated_by").references(() => users.id),
});
