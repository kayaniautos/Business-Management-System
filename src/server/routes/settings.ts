import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getMinimumMarginPercent, setMinimumMarginPercent } from "../services/margin.js";

/**
 * The one runtime-editable app setting built so far: the margin alert
 * band (CLAUDE.md 5.10). Not session/auth-gated to admins specifically —
 * same pre-existing limitation as every other endpoint in this app
 * (app.ts's own comment on deferred session/auth-token handling) — the
 * EDIT control just lives inside AdminSettingsView.tsx, visually admin-
 * only, matching how every other admin-only screen in this app is gated
 * today (nav visibility, not a server-side role check).
 */
export const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    "/margin-band",
    { schema: { response: { 200: z.object({ minimumMarginPercent: z.number() }) } } },
    async () => ({ minimumMarginPercent: await getMinimumMarginPercent() }),
  );

  app.put(
    "/margin-band",
    {
      schema: {
        body: z.object({ minimumMarginPercent: z.number().min(0).max(100) }),
        response: { 200: z.object({ minimumMarginPercent: z.number() }) },
      },
    },
    async (request) => {
      await setMinimumMarginPercent(request.body.minimumMarginPercent);
      return { minimumMarginPercent: await getMinimumMarginPercent() };
    },
  );
};
