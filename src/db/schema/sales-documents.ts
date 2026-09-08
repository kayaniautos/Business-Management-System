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
 * Sales document chain per CLAUDE.md 5.9/5.10:
 *   Quotation -> Delivery Note (DN) -> Proforma Sales Tax Invoice / Sales Tax Invoice
 * Any step can also be created directly (a DN doesn't need a Quotation
 * first; an Invoice doesn't need a DN first).
 *
 * Modeled as ONE header table with a `documentType` discriminator, not
 * three separate tables, because the three share nearly all their fields
 * (party, dates, vehicle details, PO number, GST/NTN snapshot, gross/tax
 * totals) and the client's own notes ask for line-sequencing/serial-
 * numbering and the Print Name override to be "identical behavior" across
 * all three - shared schema for genuinely shared behavior, per this
 * project's own "build once as shared behavior" instruction.
 *
 * [unclear — confirm] "Proforma Sales Tax Invoice" vs "Sales Tax Invoice",
 * and "Invoice format" vs "Bill format" (CLAUDE.md 5.10/handover 8.3), are
 * both read here as print-time labeling of the SAME invoice record, not
 * separate documents or states — nothing in the spec suggests a different
 * stock/accounting effect between them. If that reading is wrong, invoice
 * needs to split into two document types.
 *
 * Deliberately NOT built in this pass:
 * - Settlement channels / payments — CLAUDE.md's own build-phase table
 *   scopes "settlement channels" to Phase 4 (Accounting), not Phase 2
 *   (Sales). Building a payments table now risks conflicting with the
 *   Vouchers module (CLAUDE.md section 8) once that's designed.
 * - Margin alerts / override logging (CLAUDE.md 5.10) — needs a cost
 *   figure (LIFO cost-layer engine) that doesn't exist yet. Adding an
 *   inert "margin override" column ahead of that engine would be a
 *   half-finished feature.
 * - Tax computation itself (the "gross-price-entry pattern": staff enter
 *   gross, system computes tax breakdown) — `lineTaxAmount`/`taxTotal`
 *   columns exist to hold the result, but no tax rule engine is built;
 *   the application is responsible for computing and writing these.
 */
export const salesDocumentTypeEnum = pgEnum("sales_document_type", [
  "quotation",
  "delivery_note",
  "invoice",
]);

/**
 * Post/Unpost pattern (CLAUDE.md 5.9) applies to DN and Invoice. A
 * Quotation is "just a subsidiary record and requires no accounting" —
 * the application never actually posts one, even though this shared enum
 * technically allows it. Not split into a separate status type per
 * document type, to keep the shared header table simple; enforced in
 * application logic, not the schema.
 */
export const salesDocumentStatusEnum = pgEnum("sales_document_status", [
  "draft",
  "posted",
  "unposted",
]);

export const salesDocuments = pgTable("sales_documents", {
  ...idColumn,
  documentType: salesDocumentTypeEnum("document_type").notNull(),
  // Human-facing sequential number (CLAUDE.md 3.1) — assigned by the
  // application via document_number_counters, using this table's
  // documentType value as that table's free-text document_type key.
  documentNumber: varchar("document_number", { length: 50 }).notNull(),
  legalEntityId: uuid("legal_entity_id")
    .notNull()
    .references(() => legalEntities.id),
  // Nullable: [unclear — confirm] whether Quotation/DN require a Party or
  // can be walk-in like the retail POS concept already shows for Invoice
  // ("Walk-in customer"). Modeled as optional everywhere rather than
  // guessing per document type.
  partyId: uuid("party_id").references(() => parties.id),
  customerRef: varchar("customer_ref", { length: 100 }),
  ourRefNo: varchar("our_ref_no", { length: 100 }),
  documentDate: date("document_date").notNull(),
  vehicleDetails: text("vehicle_details"),
  poNo: varchar("po_no", { length: 100 }),
  // Snapshotted from the party at creation time, not a live join — an
  // already-issued document shouldn't silently change if the party's
  // GST/NTN is edited later.
  customerGstNo: varchar("customer_gst_no", { length: 50 }),
  customerNtnNo: varchar("customer_ntn_no", { length: 50 }),
  // Quote expiry — meaningful for Quotation only, left null/unused on DN
  // and Invoice rather than splitting into per-type tables for one field.
  validUntil: date("valid_until"),
  // Quotation No. this DN was raised from, and DN/Quotation numbers an
  // Invoice was raised from, are NOT foreign keys here — see
  // sales_document_links below, which is many-to-many (an invoice can
  // merge lines from several DNs; CLAUDE.md 5.10).
  subtotalAmount: numeric("subtotal_amount", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  // Sum of sales_document_discounts rows. In practice only ever non-zero
  // on Kiyani Autos documents — see that table's comment.
  discountTotal: numeric("discount_total", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  taxTotal: numeric("tax_total", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  totalAmount: numeric("total_amount", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  status: salesDocumentStatusEnum("status").notNull().default("draft"),
  postedAt: timestamp("posted_at", { withTimezone: true }),
  ...timestampColumns,
  createdBy: uuid("created_by").references(() => users.id),
  updatedBy: uuid("updated_by").references(() => users.id),
});

/**
 * Flexible document-chain relationship, not a single `previous_document_id`
 * column, because the chain isn't strictly 1:1: one Invoice can draw from
 * several DNs combined (CLAUDE.md 5.10), and — per the same reasoning —
 * more than one DN could conceivably be raised from one Quotation by
 * picking different line items each time (client's notes: "selection of
 * items happens individually").
 */
export const salesDocumentLinks = pgTable(
  "sales_document_links",
  {
    ...idColumn,
    // The earlier document in the chain (Quotation or DN).
    fromDocumentId: uuid("from_document_id")
      .notNull()
      .references(() => salesDocuments.id),
    // The later document drawing from it (DN or Invoice).
    toDocumentId: uuid("to_document_id")
      .notNull()
      .references(() => salesDocuments.id),
    ...timestampColumns,
    createdBy: uuid("created_by").references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id),
  },
  (table) => [
    uniqueIndex("sales_document_links_from_to_unique").on(
      table.fromDocumentId,
      table.toDocumentId,
    ),
  ],
);

/**
 * Line items. `controlPartId` is required for now because Deal Part
 * (CLAUDE.md 5.4, bundling) and the "generic catch-all item" for
 * uncatalogued parts (handover doc 6.2) don't exist yet — both are
 * extension points that will need this column to become nullable
 * alongside a new reference once built, not something to guess at now.
 */
export const salesDocumentLines = pgTable("sales_document_lines", {
  ...idColumn,
  salesDocumentId: uuid("sales_document_id")
    .notNull()
    .references(() => salesDocuments.id, { onDelete: "cascade" }),
  // Manually editable serial number for print (CLAUDE.md 5.9: "manual
  // control over line sequencing/serial numbering") — not an implicit
  // insertion-order column.
  lineNumber: integer("line_number").notNull(),
  controlPartId: uuid("control_part_id")
    .notNull()
    .references(() => controlParts.id),
  // Per-invoice Print Name override (CLAUDE.md 5.9/5.10): falls back to
  // controlParts.name when null, resolved at display/print time —
  // renaming here never touches the catalog record.
  displayName: varchar("display_name", { length: 200 }),
  quantity: integer("quantity").notNull(),
  unitGrossPrice: numeric("unit_gross_price", {
    precision: 14,
    scale: 2,
  }).notNull(),
  lineGrossAmount: numeric("line_gross_amount", {
    precision: 14,
    scale: 2,
  }).notNull(),
  // Tax breakdown result — see the "deliberately not built" note above;
  // the application computes this, no tax rule engine exists yet.
  lineTaxAmount: numeric("line_tax_amount", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  ...timestampColumns,
  createdBy: uuid("created_by").references(() => users.id),
  updatedBy: uuid("updated_by").references(() => users.id),
});

/**
 * Itemized discount lines (CLAUDE.md 5.10, confirmed 2026-09-08): flat
 * Rupee amount, not a percentage. Two business rules are enforced at the
 * APPLICATION layer, not here, consistent with the same choice already
 * made for party_phone_numbers' "1 to 5" cap:
 * - Kiyani Autos only — Kiyan Traders uses net-of-discount pricing baked
 *   into unitGrossPrice, with no separate discount line at all.
 * - At most 2 discount lines per document.
 * A Postgres CHECK constraint can't reach across to the parent
 * sales_documents row's legalEntityId without a trigger, so the entity
 * restriction isn't enforced at the database level.
 */
export const salesDocumentDiscounts = pgTable("sales_document_discounts", {
  ...idColumn,
  salesDocumentId: uuid("sales_document_id")
    .notNull()
    .references(() => salesDocuments.id, { onDelete: "cascade" }),
  label: varchar("label", { length: 200 }).notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  ...timestampColumns,
  createdBy: uuid("created_by").references(() => users.id),
  updatedBy: uuid("updated_by").references(() => users.id),
});
