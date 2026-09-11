import { useEffect, useMemo, useState } from "react";
import {
  createCarModel,
  deleteCarModel,
  getCarModels,
  updateCarModel,
  type CarModel,
  type CarModelInput,
} from "./api.js";

const EMPTY_FORM: CarModelInput = {
  make: "",
  model: "",
  variant: "",
  frameEngineName: "",
  yearFrom: undefined,
  yearTo: undefined,
  engineCapacityCc: undefined,
  transmission: "",
  engineFuel: "",
};

// Fixed dropdown choices (Mehmoon's direction, 2026-09-11) — the column
// itself stays free text at the schema/API level (CLAUDE.md 5.3: the
// client has never confirmed a closed list), this is purely a data-entry
// constraint in this one form so staff pick from a short, consistent set
// instead of typing free text that can drift ("Auto" vs "Automatic").
// Covers every value already seeded (seed-car-makes.ts) plus CNG, common
// in Pakistan's older/converted fleet.
const TRANSMISSION_OPTIONS = ["Manual", "Automatic", "CVT"];
const FUEL_OPTIONS = ["Petrol", "Diesel", "Hybrid", "CNG"];

/**
 * First dedicated Car Models screen (Mehmoon's direction, 2026-09-11) —
 * until now a car_models row could only ever be created inline, one at a
 * time, while attaching fitment to a part in Inventory (InventoryView.tsx)
 * — there was no way to browse every vehicle on file, fix a typo, or
 * remove one outright. This is a plain list/search/add/edit/delete CRUD
 * screen, independent of any specific part.
 *
 * Also closes the gap CLAUDE.md 5.3 flagged: the Control Part Form's
 * fitment-line fields ("Frame/Engine name, Engine capacity/CC,
 * Transmission, Engine Fuel") now have real columns, plus a `variant`
 * field (e.g. "GLi," "Altis") Mehmoon asked for directly. Variant and
 * frame/engine name stay free text (no confirmed closed list exists for
 * either); transmission and fuel are dropdowns in THIS form only
 * (`TRANSMISSION_OPTIONS`/`FUEL_OPTIONS` below) — the column itself is
 * still plain varchar at the schema/API level, so this is a data-entry
 * constraint, not a schema commitment to an enum the client hasn't
 * confirmed.
 *
 * List grouped by make+model, same day: once trim-level rows existed
 * (Corolla XLI/GLI/Altis/Grande, etc. — see the seed-car-makes.ts build
 * log entry), a flat list showed the same car four separate times with
 * no visual link between them. A model with only one row on file (no
 * real variant, e.g. "Suzuki Ravi") still renders as a single plain row;
 * grouping only changes anything once there's more than one to group.
 *
 * Make/Model autocomplete added 2026-09-11: counter staff are
 * blue-collar and typing by hand, so a real typo ("Sazuki," "Carolla")
 * is expected, not an edge case (Mehmoon's own examples). The fix is
 * suggesting from what's already on file as they type — via `<datalist>`,
 * the simplest native autocomplete, no custom dropdown component needed —
 * rather than a curated master list, since the client's actual make/model
 * range (including used/imported variants) isn't something to guess at
 * and hard-code. This only helps once at least one correct spelling
 * exists; it doesn't stop the very first typo of a brand-new make. The
 * backend separately reuses existing casing for an exact case-insensitive
 * match ("suzuki" -> "Suzuki") — see inventory.ts's own comment for why
 * that's a narrower, different fix than this one.
 */
export function CarModelsView() {
  const [carModels, setCarModels] = useState<CarModel[]>([]);
  // Independent of the (possibly search-filtered) list above — always the
  // full, unfiltered set, used only to source autocomplete suggestions so
  // a narrowed search doesn't shrink what's suggestable while typing.
  const [allCarModels, setAllCarModels] = useState<CarModel[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CarModelInput>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  function load(query?: string) {
    getCarModels(query)
      .then(setCarModels)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load car models"));
  }

  function loadAll() {
    getCarModels().then(setAllCarModels).catch(() => {});
  }

  useEffect(() => {
    load();
    loadAll();
  }, []);

  const knownMakes = useMemo(() => [...new Set(allCarModels.map((c) => c.make))].sort(), [allCarModels]);
  const knownModels = useMemo(() => [...new Set(allCarModels.map((c) => c.model))].sort(), [allCarModels]);

  // Grouped by make+model (Mehmoon's direction, 2026-09-11): once trim-
  // level rows exist (Corolla XLI/GLI/Altis/Grande, etc.), a flat list
  // shows the same car four times over with no visual link between them.
  // A model with only one row (no real variants, e.g. "Suzuki Ravi")
  // renders exactly as before — grouping only changes anything once
  // there's actually more than one row to group.
  const groups = useMemo(() => {
    const map = new Map<string, { make: string; model: string; rows: CarModel[] }>();
    for (const c of carModels) {
      const key = `${c.make}|${c.model}`;
      const group = map.get(key) ?? { make: c.make, model: c.model, rows: [] };
      group.rows.push(c);
      map.set(key, group);
    }
    return [...map.values()].sort((a, b) => a.make.localeCompare(b.make) || a.model.localeCompare(b.model));
  }, [carModels]);

  function startCreate() {
    setEditingId("new");
    setForm(EMPTY_FORM);
    setError(null);
  }

  function startEdit(c: CarModel) {
    setEditingId(c.id);
    setForm({
      make: c.make,
      model: c.model,
      variant: c.variant ?? "",
      frameEngineName: c.frameEngineName ?? "",
      yearFrom: c.yearFrom ?? undefined,
      yearTo: c.yearTo ?? undefined,
      engineCapacityCc: c.engineCapacityCc ?? undefined,
      transmission: c.transmission ?? "",
      engineFuel: c.engineFuel ?? "",
    });
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
  }

  function field<K extends keyof CarModelInput>(key: K, value: CarModelInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function cleanInput(): CarModelInput {
    return {
      make: form.make.trim(),
      model: form.model.trim(),
      variant: form.variant?.trim() || undefined,
      frameEngineName: form.frameEngineName?.trim() || undefined,
      yearFrom: form.yearFrom || undefined,
      yearTo: form.yearTo || undefined,
      engineCapacityCc: form.engineCapacityCc || undefined,
      transmission: form.transmission?.trim() || undefined,
      engineFuel: form.engineFuel?.trim() || undefined,
    };
  }

  async function handleSave() {
    if (!form.make.trim() || !form.model.trim()) {
      setError("Make and model are required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const input = cleanInput();
      if (editingId === "new") {
        const created = await createCarModel(input);
        setCarModels((prev) => [...prev, created].sort((a, b) => a.make.localeCompare(b.make) || a.model.localeCompare(b.model)));
      } else if (editingId) {
        const updated = await updateCarModel(editingId, input);
        setCarModels((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      }
      loadAll();
      cancelEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save car model");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(c: CarModel) {
    const label = `${c.make} ${c.model}${c.variant ? ` ${c.variant}` : ""}`;
    if (!window.confirm(`Delete ${label}? This will also remove it from any parts it's attached to.`)) return;
    try {
      await deleteCarModel(c.id);
      setCarModels((prev) => prev.filter((cm) => cm.id !== c.id));
      setAllCarModels((prev) => prev.filter((cm) => cm.id !== c.id));
      if (editingId === c.id) cancelEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete car model");
    }
  }

  return (
    <div style={{ flex: 1, display: "flex", gap: 20, padding: 24, overflow: "hidden" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Car models</div>
          <button type="button" className="btn-primary" style={{ padding: "8px 16px" }} onClick={startCreate}>
            + Add car model
          </button>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load(q)}
            placeholder="Search make, model, or variant..."
            style={{ flex: 1, padding: "10px 14px", fontSize: 14, borderRadius: 12, border: "1px solid var(--line)", background: "white" }}
          />
          <button type="button" className="btn-primary" style={{ padding: "0 20px" }} onClick={() => load(q)}>
            Search
          </button>
        </div>

        {error && <div className="error-text">{error}</div>}
        {carModels.length === 0 && <div className="muted" style={{ fontSize: 13 }}>No car models found.</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {groups.map((g) => {
            const groupKey = `${g.make}|${g.model}`;
            if (g.rows.length === 1) {
              return <CarModelRow key={groupKey} c={g.rows[0]} onEdit={startEdit} onDelete={handleDelete} />;
            }
            return (
              <div key={groupKey} className="glass-card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{g.make} {g.model}</div>
                {g.rows.map((c) => (
                  <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, paddingLeft: 12, borderLeft: "2px solid var(--line)" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 12.5 }}>{c.variant || "—"}</div>
                      <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                        {c.yearFrom && c.yearTo ? `${c.yearFrom}-${c.yearTo}` : c.yearFrom ? `${c.yearFrom}+` : "Year not specified"}
                        {c.frameEngineName && ` · ${c.frameEngineName}`}
                        {c.engineCapacityCc && ` · ${c.engineCapacityCc}cc`}
                        {c.transmission && ` · ${c.transmission}`}
                        {c.engineFuel && ` · ${c.engineFuel}`}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button type="button" onClick={() => startEdit(c)} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--line)", background: "white", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                        Edit
                      </button>
                      <button type="button" onClick={() => handleDelete(c)} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--line)", background: "white", color: "oklch(55% 0.18 25)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {editingId && (
        <div className="glass-card" style={{ width: 360, flexShrink: 0, display: "flex", flexDirection: "column", padding: 20, gap: 10, overflowY: "auto" }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>
            {editingId === "new" ? "Add car model" : "Edit car model"}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <input placeholder="Make (required)" list="known-makes" value={form.make} onChange={(e) => field("make", e.target.value)} style={{ padding: 8, fontSize: 12.5 }} />
            <input placeholder="Model (required)" list="known-models" value={form.model} onChange={(e) => field("model", e.target.value)} style={{ padding: 8, fontSize: 12.5 }} />
          </div>
          <datalist id="known-makes">
            {knownMakes.map((m) => <option key={m} value={m} />)}
          </datalist>
          <datalist id="known-models">
            {knownModels.map((m) => <option key={m} value={m} />)}
          </datalist>

          <input placeholder="Variant (e.g. GLi, Altis)" value={form.variant ?? ""} onChange={(e) => field("variant", e.target.value)} style={{ padding: 8, fontSize: 12.5 }} />
          <input placeholder="Frame / engine name" value={form.frameEngineName ?? ""} onChange={(e) => field("frameEngineName", e.target.value)} style={{ padding: 8, fontSize: 12.5 }} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <input placeholder="Year from" type="number" value={form.yearFrom ?? ""} onChange={(e) => field("yearFrom", e.target.value ? Number(e.target.value) : undefined)} style={{ padding: 8, fontSize: 12.5 }} />
            <input placeholder="Year to" type="number" value={form.yearTo ?? ""} onChange={(e) => field("yearTo", e.target.value ? Number(e.target.value) : undefined)} style={{ padding: 8, fontSize: 12.5 }} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <input placeholder="Engine CC" type="number" value={form.engineCapacityCc ?? ""} onChange={(e) => field("engineCapacityCc", e.target.value ? Number(e.target.value) : undefined)} style={{ padding: 8, fontSize: 12.5 }} />
            <select value={form.transmission ?? ""} onChange={(e) => field("transmission", e.target.value)} style={{ padding: 8, fontSize: 12.5 }}>
              <option value="">Transmission...</option>
              {TRANSMISSION_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <select value={form.engineFuel ?? ""} onChange={(e) => field("engineFuel", e.target.value)} style={{ padding: 8, fontSize: 12.5 }}>
            <option value="">Engine fuel...</option>
            {FUEL_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>

          {error && <div className="error-text">{error}</div>}

          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button type="button" className="btn-primary" style={{ flex: 1 }} disabled={saving} onClick={handleSave}>
              {saving ? "Saving..." : editingId === "new" ? "Create" : "Save changes"}
            </button>
            <button type="button" onClick={cancelEdit} style={{ padding: "0 16px", borderRadius: 10, border: "1px solid var(--line)", background: "white", fontWeight: 700, cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** A make+model with no other variant on file — rendered exactly like
 * before grouping existed, since there's nothing to group it under. */
function CarModelRow({
  c,
  onEdit,
  onDelete,
}: {
  c: CarModel;
  onEdit: (c: CarModel) => void;
  onDelete: (c: CarModel) => void;
}) {
  return (
    <div className="glass-card" style={{ padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 13.5 }}>
          {c.make} {c.model}{c.variant ? ` ${c.variant}` : ""}
        </div>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
          {c.yearFrom && c.yearTo ? `${c.yearFrom}-${c.yearTo}` : c.yearFrom ? `${c.yearFrom}+` : "Year not specified"}
          {c.frameEngineName && ` · ${c.frameEngineName}`}
          {c.engineCapacityCc && ` · ${c.engineCapacityCc}cc`}
          {c.transmission && ` · ${c.transmission}`}
          {c.engineFuel && ` · ${c.engineFuel}`}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button type="button" onClick={() => onEdit(c)} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--line)", background: "white", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          Edit
        </button>
        <button type="button" onClick={() => onDelete(c)} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--line)", background: "white", color: "oklch(55% 0.18 25)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          Delete
        </button>
      </div>
    </div>
  );
}
