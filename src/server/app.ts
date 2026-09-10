import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { authRoutes } from "./routes/auth.js";
import { partsRoutes } from "./routes/parts.js";
import { entitiesRoutes } from "./routes/entities.js";
import { salesRoutes } from "./routes/sales.js";
import { inventoryRoutes } from "./routes/inventory.js";
import { partiesRoutes } from "./routes/parties.js";
import { quotationsRoutes } from "./routes/quotations.js";
import { deliveryNotesRoutes } from "./routes/delivery-notes.js";
import { stockAdjustmentsRoutes } from "./routes/stock-adjustments.js";
import { dealPartsRoutes } from "./routes/deal-parts.js";
import { rolesRoutes } from "./routes/roles.js";
import { adminUsersRoutes } from "./routes/admin-users.js";
import { purchaseOrdersRoutes } from "./routes/purchase-orders.js";
import { goodsReceiptsRoutes } from "./routes/goods-receipts.js";
import { purchaseInvoicesRoutes } from "./routes/purchase-invoices.js";
import { purchasesRoutes } from "./routes/purchases.js";

/**
 * First-pass Fastify backend for the vertical slice: real login against the
 * seeded `users` table, real parts search against seeded inventory. Chosen
 * over Express (see DECISIONS.md) mainly for built-in Zod-based request
 * validation with type inference — this app is dozens of structured forms
 * (CLAUDE.md Forms A-G), so that pays off repeatedly.
 *
 * No session/auth-token handling yet — login returns the user's identity
 * and roles on success; the frontend holds that in memory for this pass.
 * Deliberately deferred, not an oversight: this is a local desktop app
 * talking to its own local Postgres, not an internet-facing API, so
 * session hardening matters less here than getting a real end-to-end path
 * working first.
 */
export function buildApp() {
  const app = Fastify({ logger: true }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.register(authRoutes, { prefix: "/api/auth" });
  app.register(partsRoutes, { prefix: "/api/parts" });
  app.register(entitiesRoutes, { prefix: "/api/entities" });
  app.register(salesRoutes, { prefix: "/api/sales" });
  app.register(inventoryRoutes, { prefix: "/api/inventory" });
  app.register(partiesRoutes, { prefix: "/api/parties" });
  app.register(quotationsRoutes, { prefix: "/api/quotations" });
  app.register(deliveryNotesRoutes, { prefix: "/api/delivery-notes" });
  app.register(stockAdjustmentsRoutes, { prefix: "/api/stock-adjustments" });
  app.register(dealPartsRoutes, { prefix: "/api/deal-parts" });
  app.register(rolesRoutes, { prefix: "/api/admin/roles" });
  app.register(adminUsersRoutes, { prefix: "/api/admin/users" });
  app.register(purchaseOrdersRoutes, { prefix: "/api/purchase-orders" });
  app.register(goodsReceiptsRoutes, { prefix: "/api/goods-receipts" });
  app.register(purchaseInvoicesRoutes, { prefix: "/api/purchase-invoices" });
  app.register(purchasesRoutes, { prefix: "/api/purchases" });

  app.get("/api/health", async () => ({ ok: true }));

  return app;
}
