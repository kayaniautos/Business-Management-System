import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
  parties,
  partyPhoneNumbers,
  salesDocuments,
  purchaseDocuments,
  legalEntities,
  settlements,
} from "../../db/schema/index.js";

const partyStatusSchema = z.enum(["C1", "C2", "C3"]);
const partyNatureSchema = z.enum(["S1", "S2", "S3"]);

const partyResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  printName: z.string().nullable(),
  gstNo: z.string().nullable(),
  ntnNo: z.string().nullable(),
  status: partyStatusSchema,
  nature: partyNatureSchema,
  phoneNumbers: z.array(z.string()),
});

/**
 * First real CRUD for the Party Form (CLAUDE.md 5.5). Status (C1/C2/C3)
 * and Nature (S1/S2/S3) are two independent axes, per the confirmed spec —
 * both are required on create, neither implies the other.
 *
 * [unclear — confirm] The POS checkout party picker (see sales.ts) filters
 * to Nature "S3" (Customer Receivable A/C) only, on the reading that
 * Nature is what determines whether a party can be sold to at all. This
 * screen itself does not filter — it manages all parties regardless of
 * Nature, since vendors/suppliers need records here too.
 */
export const partiesRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    "/",
    {
      schema: {
        querystring: z.object({ q: z.string().optional(), nature: partyNatureSchema.optional() }),
        response: { 200: z.array(partyResponseSchema) },
      },
    },
    async (request) => {
      const { q, nature } = request.query;
      const rows = await db.query.parties.findMany({
        where: (p, { and, eq: eqOp, ilike: ilikeOp }) => {
          const conditions = [];
          if (q) conditions.push(ilikeOp(p.name, `%${q}%`));
          if (nature) conditions.push(eqOp(p.nature, nature));
          return conditions.length ? and(...conditions) : undefined;
        },
        orderBy: (p, { asc }) => asc(p.name),
      });
      if (rows.length === 0) return [];

      const phoneRows = await db
        .select({ partyId: partyPhoneNumbers.partyId, phoneNumber: partyPhoneNumbers.phoneNumber })
        .from(partyPhoneNumbers)
        .where(inArray(partyPhoneNumbers.partyId, rows.map((r) => r.id)));
      const phonesByParty = new Map<string, string[]>();
      for (const p of phoneRows) {
        const list = phonesByParty.get(p.partyId) ?? [];
        list.push(p.phoneNumber);
        phonesByParty.set(p.partyId, list);
      }

      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        printName: r.printName,
        gstNo: r.gstNo,
        ntnNo: r.ntnNo,
        status: r.status,
        nature: r.nature,
        phoneNumbers: phonesByParty.get(r.id) ?? [],
      }));
    },
  );

  app.post(
    "/",
    {
      schema: {
        body: z.object({
          name: z.string().min(1).max(200),
          printName: z.string().max(200).optional(),
          gstNo: z.string().max(50).optional(),
          ntnNo: z.string().max(50).optional(),
          status: partyStatusSchema,
          nature: partyNatureSchema,
          // Capped at 5 per CLAUDE.md 5.5 ("1 to 5 phone numbers") —
          // enforced here at the application layer, same as the schema's
          // own comment says, not a database constraint.
          phoneNumbers: z.array(z.string().min(1).max(30)).min(1).max(5),
        }),
        response: { 200: partyResponseSchema },
      },
    },
    async (request) => {
      const { phoneNumbers, ...partyFields } = request.body;

      return db.transaction(async (tx) => {
        const [party] = await tx.insert(parties).values(partyFields).returning();
        await tx
          .insert(partyPhoneNumbers)
          .values(phoneNumbers.map((phoneNumber) => ({ partyId: party.id, phoneNumber })));

        return {
          id: party.id,
          name: party.name,
          printName: party.printName,
          gstNo: party.gstNo,
          ntnNo: party.ntnNo,
          status: party.status,
          nature: party.nature,
          phoneNumbers,
        };
      });
    },
  );

  /**
   * Party ledger/statement — first screen showing a party's transaction
   * history, combining both sides regardless of the party's own Nature
   * (S1/S2/S3): nothing at the database level stops a sales_documents or
   * purchase_documents row from referencing any party, so this reads both
   * tables rather than trusting Nature to predict which one has data.
   *
   * `totalInvoiced`/`totalBilled` are the sum of posted amounts on the
   * ONE document type that represents a real financial commitment on
   * each side — an Invoice for sales, a Purchase Invoice for purchases —
   * not a DN, Quotation, Purchase Order, or Goods Receipt, none of which
   * are themselves a bill. `totalReceived`/`totalPaid` (added 2026-09-12
   * once settlements existed — see settlements.ts) are the sum of actual
   * settlement rows against those same documents, and `totalReturned`
   * (added the same day — see supplier-returns.ts) is the sum of posted
   * Supplier Return totals, which reduce what's owed the same way a
   * payment does. `netReceivable`/`netPayable` subtract all of that —
   * this is now a REAL running balance, not just "everything ever
   * billed." It can still be wrong in one direction a client might not
   * expect: a settlement/return recorded against a document that
   * predates this feature, or a document type outside the ones named
   * above (e.g. money exchanged against a DN before it's ever invoiced)
   * won't be reflected — same "only a real bill counts" scoping as the
   * gross totals.
   */
  const ledgerTransactionSchema = z.object({
    id: z.string(),
    kind: z.enum(["sale", "purchase", "receipt", "payment_made", "supplier_return"]),
    documentType: z.string(),
    documentNumber: z.string(),
    entityName: z.string(),
    documentDate: z.string(),
    status: z.string(),
    totalAmount: z.string(),
  });

  app.get(
    "/:id/ledger",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({
            party: partyResponseSchema,
            transactions: z.array(ledgerTransactionSchema),
            totalInvoiced: z.string(),
            totalReceived: z.string(),
            netReceivable: z.string(),
            totalBilled: z.string(),
            totalPaid: z.string(),
            totalReturned: z.string(),
            netPayable: z.string(),
          }),
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const party = await db.query.parties.findFirst({ where: eq(parties.id, id) });
      if (!party) return reply.code(404).send({ error: "Party not found" });

      const phoneRows = await db
        .select({ phoneNumber: partyPhoneNumbers.phoneNumber })
        .from(partyPhoneNumbers)
        .where(eq(partyPhoneNumbers.partyId, id));

      const saleRows = await db
        .select({
          id: salesDocuments.id,
          documentType: salesDocuments.documentType,
          documentNumber: salesDocuments.documentNumber,
          entityName: legalEntities.name,
          documentDate: salesDocuments.documentDate,
          status: salesDocuments.status,
          totalAmount: salesDocuments.totalAmount,
        })
        .from(salesDocuments)
        .innerJoin(legalEntities, eq(salesDocuments.legalEntityId, legalEntities.id))
        .where(eq(salesDocuments.partyId, id));

      const purchaseRows = await db
        .select({
          id: purchaseDocuments.id,
          documentType: purchaseDocuments.documentType,
          documentNumber: purchaseDocuments.documentNumber,
          entityName: legalEntities.name,
          documentDate: purchaseDocuments.documentDate,
          status: purchaseDocuments.status,
          totalAmount: purchaseDocuments.totalAmount,
        })
        .from(purchaseDocuments)
        .innerJoin(legalEntities, eq(purchaseDocuments.legalEntityId, legalEntities.id))
        .where(eq(purchaseDocuments.partyId, id));

      const receiptRows = await db
        .select({
          id: settlements.id,
          documentNumber: salesDocuments.documentNumber,
          entityName: legalEntities.name,
          documentDate: settlements.paymentDate,
          totalAmount: settlements.amount,
          channel: settlements.channel,
        })
        .from(settlements)
        .innerJoin(salesDocuments, eq(settlements.salesDocumentId, salesDocuments.id))
        .innerJoin(legalEntities, eq(salesDocuments.legalEntityId, legalEntities.id))
        .where(eq(salesDocuments.partyId, id));

      const paymentRows = await db
        .select({
          id: settlements.id,
          documentNumber: purchaseDocuments.documentNumber,
          entityName: legalEntities.name,
          documentDate: settlements.paymentDate,
          totalAmount: settlements.amount,
          channel: settlements.channel,
        })
        .from(settlements)
        .innerJoin(purchaseDocuments, eq(settlements.purchaseDocumentId, purchaseDocuments.id))
        .innerJoin(legalEntities, eq(purchaseDocuments.legalEntityId, legalEntities.id))
        .where(eq(purchaseDocuments.partyId, id));

      const transactions = [
        ...saleRows.map((r) => ({ ...r, kind: "sale" as const })),
        // A Supplier Return reduces what's owed, the opposite direction of
        // every other purchase_documents row — given its own kind so the
        // frontend doesn't have to sniff documentType to get the sign
        // right (see PartyView.tsx's isIncrease check).
        ...purchaseRows.map((r) =>
          r.documentType === "supplier_return"
            ? { ...r, kind: "supplier_return" as const }
            : { ...r, kind: "purchase" as const },
        ),
        ...receiptRows.map((r) => ({
          id: r.id,
          kind: "receipt" as const,
          documentType: `receipt_${r.channel}`,
          documentNumber: r.documentNumber,
          entityName: r.entityName,
          documentDate: r.documentDate,
          status: "posted",
          totalAmount: r.totalAmount,
        })),
        ...paymentRows.map((r) => ({
          id: r.id,
          kind: "payment_made" as const,
          documentType: `payment_${r.channel}`,
          documentNumber: r.documentNumber,
          entityName: r.entityName,
          documentDate: r.documentDate,
          status: "posted",
          totalAmount: r.totalAmount,
        })),
      ].sort((a, b) => (a.documentDate < b.documentDate ? 1 : a.documentDate > b.documentDate ? -1 : 0));

      const [invoicedRow] = await db
        .select({ total: sql<string>`coalesce(sum(${salesDocuments.totalAmount}), 0)` })
        .from(salesDocuments)
        .where(and(eq(salesDocuments.partyId, id), eq(salesDocuments.documentType, "invoice"), eq(salesDocuments.status, "posted")));

      const [billedRow] = await db
        .select({ total: sql<string>`coalesce(sum(${purchaseDocuments.totalAmount}), 0)` })
        .from(purchaseDocuments)
        .where(and(eq(purchaseDocuments.partyId, id), eq(purchaseDocuments.documentType, "purchase_invoice"), eq(purchaseDocuments.status, "posted")));

      const [receivedRow] = await db
        .select({ total: sql<string>`coalesce(sum(${settlements.amount}), 0)` })
        .from(settlements)
        .innerJoin(salesDocuments, eq(settlements.salesDocumentId, salesDocuments.id))
        .where(eq(salesDocuments.partyId, id));

      const [paidRow] = await db
        .select({ total: sql<string>`coalesce(sum(${settlements.amount}), 0)` })
        .from(settlements)
        .innerJoin(purchaseDocuments, eq(settlements.purchaseDocumentId, purchaseDocuments.id))
        .where(eq(purchaseDocuments.partyId, id));

      const [returnedRow] = await db
        .select({ total: sql<string>`coalesce(sum(${purchaseDocuments.totalAmount}), 0)` })
        .from(purchaseDocuments)
        .where(and(eq(purchaseDocuments.partyId, id), eq(purchaseDocuments.documentType, "supplier_return"), eq(purchaseDocuments.status, "posted")));

      const totalInvoiced = invoicedRow?.total ?? "0";
      const totalBilled = billedRow?.total ?? "0";
      const totalReceived = receivedRow?.total ?? "0";
      const totalPaid = paidRow?.total ?? "0";
      const totalReturned = returnedRow?.total ?? "0";

      return {
        party: {
          id: party.id,
          name: party.name,
          printName: party.printName,
          gstNo: party.gstNo,
          ntnNo: party.ntnNo,
          status: party.status,
          nature: party.nature,
          phoneNumbers: phoneRows.map((r) => r.phoneNumber),
        },
        transactions,
        totalInvoiced,
        totalReceived,
        netReceivable: (Number(totalInvoiced) - Number(totalReceived)).toFixed(2),
        totalBilled,
        totalPaid,
        totalReturned,
        netPayable: (Number(totalBilled) - Number(totalPaid) - Number(totalReturned)).toFixed(2),
      };
    },
  );
};
