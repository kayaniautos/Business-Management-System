import { useEffect, useState } from "react";
import { getEntities, getMarginOverrides, type LegalEntity, type MarginOverrideRow } from "./api.js";

/**
 * Margin-override log (CLAUDE.md 5.10: "a margin-override log report
 * should exist"). Read-only — every row here was already flagged by
 * services/margin.ts at the moment the sale actually posted; this screen
 * just lists them for review, it doesn't let anyone approve or dismiss
 * one (no approval step is confirmed as needed — see reports.ts's own
 * comment).
 */
export function MarginOverridesView() {
  const [entities, setEntities] = useState<LegalEntity[] | null>(null);
  const [entityId, setEntityId] = useState<string>("");
  const [rows, setRows] = useState<MarginOverrideRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getEntities().then(setEntities).catch(() => {});
  }, []);

  useEffect(() => {
    getMarginOverrides(entityId ? { legalEntityId: entityId } : undefined)
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load margin overrides"));
  }, [entityId]);

  return (
    <div className="view-shell" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16, padding: 24, overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>Margin overrides</div>
        {entities && (
          <select value={entityId} onChange={(e) => setEntityId(e.target.value)} style={{ padding: 8, borderRadius: 10, border: "1px solid var(--line)", fontSize: 12.5 }}>
            <option value="">All entities</option>
            {entities.map((ent) => (
              <option key={ent.id} value={ent.id}>{ent.name}</option>
            ))}
          </select>
        )}
      </div>
      <div className="muted" style={{ fontSize: 12 }}>
        Posted sale lines whose margin fell below the configured band at the time they were sold. Not a hard block — just a log for review.
      </div>
      {error && <div className="error-text">{error}</div>}
      {rows.length === 0 && !error && <div className="muted" style={{ fontSize: 13 }}>No margin overrides on file.</div>}

      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((r, i) => (
          <div key={i} className="glass-card" style={{ padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{r.catalogName} <span className="muted" style={{ fontWeight: 400 }}>({r.partNumber})</span></div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                {r.documentNumber} &middot; {r.entityName} &middot; {r.partyName ?? "Walk-in customer"} &middot; {r.documentDate}
              </div>
              <div className="muted" style={{ fontSize: 11.5 }}>
                {r.quantity} &times; Rs {r.unitGrossPrice}{r.unitCostAtSale ? ` (cost Rs ${r.unitCostAtSale})` : " (no cost on file)"}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: "oklch(55% 0.18 60)" }}>
                {r.marginPercent != null ? `${r.marginPercent.toFixed(1)}%` : "—"}
              </div>
              <div className="muted" style={{ fontSize: 10.5 }}>margin</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
