import { useEffect, useState } from "react";
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
 * field (e.g. "GLi," "Altis") Mehmoon asked for directly. All five are
 * free text/optional — the client has never confirmed a fixed list of
 * transmission/fuel values, so nothing is coerced into an invented enum.
 */
export function CarModelsView() {
  const [carModels, setCarModels] = useState<CarModel[]>([]);
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

  useEffect(() => load(), []);

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
          {carModels.map((c) => (
            <div key={c.id} className="glass-card" style={{ padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
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
      </div>

      {editingId && (
        <div className="glass-card" style={{ width: 360, flexShrink: 0, display: "flex", flexDirection: "column", padding: 20, gap: 10, overflowY: "auto" }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>
            {editingId === "new" ? "Add car model" : "Edit car model"}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <input placeholder="Make (required)" value={form.make} onChange={(e) => field("make", e.target.value)} style={{ padding: 8, fontSize: 12.5 }} />
            <input placeholder="Model (required)" value={form.model} onChange={(e) => field("model", e.target.value)} style={{ padding: 8, fontSize: 12.5 }} />
          </div>

          <input placeholder="Variant (e.g. GLi, Altis)" value={form.variant ?? ""} onChange={(e) => field("variant", e.target.value)} style={{ padding: 8, fontSize: 12.5 }} />
          <input placeholder="Frame / engine name" value={form.frameEngineName ?? ""} onChange={(e) => field("frameEngineName", e.target.value)} style={{ padding: 8, fontSize: 12.5 }} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <input placeholder="Year from" type="number" value={form.yearFrom ?? ""} onChange={(e) => field("yearFrom", e.target.value ? Number(e.target.value) : undefined)} style={{ padding: 8, fontSize: 12.5 }} />
            <input placeholder="Year to" type="number" value={form.yearTo ?? ""} onChange={(e) => field("yearTo", e.target.value ? Number(e.target.value) : undefined)} style={{ padding: 8, fontSize: 12.5 }} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <input placeholder="Engine CC" type="number" value={form.engineCapacityCc ?? ""} onChange={(e) => field("engineCapacityCc", e.target.value ? Number(e.target.value) : undefined)} style={{ padding: 8, fontSize: 12.5 }} />
            <input placeholder="Transmission" value={form.transmission ?? ""} onChange={(e) => field("transmission", e.target.value)} style={{ padding: 8, fontSize: 12.5 }} />
          </div>

          <input placeholder="Engine fuel (e.g. Petrol, Diesel, Hybrid)" value={form.engineFuel ?? ""} onChange={(e) => field("engineFuel", e.target.value)} style={{ padding: 8, fontSize: 12.5 }} />

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
