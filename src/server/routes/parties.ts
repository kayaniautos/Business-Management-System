import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { inArray } from "drizzle-orm";
import { db } from "../../db/client.js";
import { parties, partyPhoneNumbers } from "../../db/schema/index.js";

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
};
