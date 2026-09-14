import { useEffect, useMemo, useState } from "react";
import {
  attachFitment,
  carModelLabel,
  createCarModel,
  createControlPart,
  createItem,
  createMarker,
  detachFitment,
  getCarModels,
  getControlParts,
  getItems,
  getMarkers,
  updateItem,
  type CarModel,
  type ControlPart,
  type InventoryItem,
  type ItemFormFields,
  type Marker,
} from "./api.js";

const EMPTY_ITEM_FIELDS: ItemFormFields = {};

// Form A's field labels (CLAUDE.md 5.1), reused for both the "New item"
// form and the Edit form below so the two never drift out of sync.
const ITEM_FIELD_DEFS: { key: keyof ItemFormFields; label: string; type?: "number" }[] = [
  { key: "partNo", label: "Part No" },
  { key: "brand", label: "Brand" },
  { key: "origin", label: "Origin" },
  { key: "itemClass", label: "Class" },
  { key: "engineInfo", label: "Engine Info" },
  { key: "model", label: "Model" },
  { key: "size", label: "Size" },
  { key: "safetyStockDays", label: "Safety Stock Days", type: "number" },
  { key: "rpp", label: "RPP", type: "number" },
  { key: "sap", label: "SAP", type: "number" },
];

export function InventoryView() {
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [newMarkerName, setNewMarkerName] = useState("");

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const [showNewItemForm, setShowNewItemForm] = useState(false);
  const [newItemFields, setNewItemFields] = useState<ItemFormFields>(EMPTY_ITEM_FIELDS);

  const [editingItem, setEditingItem] = useState(false);
  const [editItemName, setEditItemName] = useState("");
  const [editItemFields, setEditItemFields] = useState<ItemFormFields>(EMPTY_ITEM_FIELDS);

  const selectedItem = items.find((i) => i.id === selectedItemId) ?? null;

  const [controlParts, setControlParts] = useState<ControlPart[]>([]);
  const [newPartNumber, setNewPartNumber] = useState("");
  const [newPartName, setNewPartName] = useState("");
  const [newPartParentId, setNewPartParentId] = useState("");

  const [carModels, setCarModels] = useState<CarModel[]>([]);
  const [fitmentTarget, setFitmentTarget] = useState<string | null>(null);
  const [fitmentCarModelId, setFitmentCarModelId] = useState("");
  const [newCarMake, setNewCarMake] = useState("");
  const [newCarModelName, setNewCarModelName] = useState("");
  const [newCarYearFrom, setNewCarYearFrom] = useState("");
  const [newCarYearTo, setNewCarYearTo] = useState("");

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMarkers().then(setMarkers).catch((e) => setError(String(e)));
    getCarModels().then(setCarModels).catch(() => {});
  }, []);

  // Autocomplete source for the "or new:" Make/Model inputs below — blue-
  // collar counter staff typing by hand will genuinely misspell "Suzuki"
  // as "Sazuki" (Mehmoon's own example, 2026-09-11); suggesting from what
  // car models already exist reduces that without maintaining a curated
  // master list. See CarModelsView.tsx's own comment for the fuller
  // reasoning, and inventory.ts for the separate backend fix (reusing
  // existing casing on an exact case-insensitive match).
  const knownMakes = useMemo(() => [...new Set(carModels.map((c) => c.make))].sort(), [carModels]);
  const knownModels = useMemo(() => [...new Set(carModels.map((c) => c.model))].sort(), [carModels]);

  useEffect(() => {
    if (!selectedMarkerId) {
      setItems([]);
      setSelectedItemId(null);
      return;
    }
    getItems(selectedMarkerId).then(setItems).catch((e) => setError(String(e)));
    setSelectedItemId(null);
  }, [selectedMarkerId]);

  useEffect(() => {
    if (!selectedItemId) {
      setControlParts([]);
      return;
    }
    getControlParts(selectedItemId).then(setControlParts).catch((e) => setError(String(e)));
    setEditingItem(false);
  }, [selectedItemId]);

  async function refreshControlParts() {
    if (selectedItemId) setControlParts(await getControlParts(selectedItemId));
  }

  async function handleAddMarker() {
    if (!newMarkerName.trim()) return;
    try {
      const marker = await createMarker(newMarkerName.trim());
      setMarkers((prev) => [...prev, marker]);
      setNewMarkerName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add marker");
    }
  }

  async function handleAddItem() {
    if (!newItemName.trim() || !selectedMarkerId) return;
    try {
      const item = await createItem(newItemName.trim(), selectedMarkerId, newItemFields);
      setItems((prev) => [...prev, item]);
      setNewItemName("");
      setNewItemFields(EMPTY_ITEM_FIELDS);
      setShowNewItemForm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add item");
    }
  }

  function startEditItem() {
    if (!selectedItem) return;
    setEditItemName(selectedItem.name);
    setEditItemFields({
      partNo: selectedItem.partNo ?? undefined,
      brand: selectedItem.brand ?? undefined,
      origin: selectedItem.origin ?? undefined,
      itemClass: selectedItem.itemClass ?? undefined,
      engineInfo: selectedItem.engineInfo ?? undefined,
      model: selectedItem.model ?? undefined,
      size: selectedItem.size ?? undefined,
      safetyStockDays: selectedItem.safetyStockDays ?? undefined,
      rpp: selectedItem.rpp ? Number(selectedItem.rpp) : undefined,
      sap: selectedItem.sap ? Number(selectedItem.sap) : undefined,
      printName: selectedItem.printName ?? undefined,
    });
    setEditingItem(true);
  }

  async function handleUpdateItem() {
    if (!selectedItem || !editItemName.trim()) return;
    try {
      const updated = await updateItem(selectedItem.id, editItemName.trim(), editItemFields);
      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      setEditingItem(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update item");
    }
  }

  async function handleAddControlPart() {
    if (!newPartNumber.trim() || !newPartName.trim() || !selectedItemId) return;
    try {
      await createControlPart(newPartNumber.trim(), newPartName.trim(), selectedItemId, newPartParentId || undefined);
      setNewPartNumber("");
      setNewPartName("");
      setNewPartParentId("");
      await refreshControlParts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add control part");
    }
  }

  async function handleAddFitment(controlPartId: string) {
    try {
      let carModelId = fitmentCarModelId;
      if (!carModelId && newCarMake.trim() && newCarModelName.trim()) {
        const created = await createCarModel({
          make: newCarMake.trim(),
          model: newCarModelName.trim(),
          yearFrom: newCarYearFrom ? Number(newCarYearFrom) : undefined,
          yearTo: newCarYearTo ? Number(newCarYearTo) : undefined,
        });
        setCarModels((prev) => [...prev, created]);
        carModelId = created.id;
      }
      if (!carModelId) return;
      await attachFitment(controlPartId, carModelId);
      setFitmentCarModelId("");
      setNewCarMake("");
      setNewCarModelName("");
      setNewCarYearFrom("");
      setNewCarYearTo("");
      setFitmentTarget(null);
      await refreshControlParts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add fitment");
    }
  }

  async function handleRemoveFitment(controlPartId: string, carModelId: string) {
    try {
      await detachFitment(controlPartId, carModelId);
      await refreshControlParts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove fitment");
    }
  }

  return (
    <div className="view-row">
      {error && (
        <div className="error-text" style={{ position: "absolute", top: 80, right: 24 }} onClick={() => setError(null)}>
          {error}
        </div>
      )}

      <div className="glass-card view-panel" style={{ width: 260, flexShrink: 0, padding: 16, display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>
        <div style={{ fontWeight: 800, fontSize: 12, textTransform: "uppercase", color: "var(--ink-500)" }}>Markers</div>
        {markers.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`staff-tile${selectedMarkerId === m.id ? " selected" : ""}`}
            style={{ flexDirection: "row", justifyContent: "flex-start", textAlign: "left" }}
            onClick={() => setSelectedMarkerId(m.id)}
          >
            {m.name}
          </button>
        ))}
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <input placeholder="New marker" value={newMarkerName} onChange={(e) => setNewMarkerName(e.target.value)} style={{ flex: 1, padding: 8, fontSize: 12.5 }} />
          <button type="button" onClick={handleAddMarker} style={{ padding: "0 10px", cursor: "pointer" }}>+</button>
        </div>
      </div>

      <div className="view-main" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
        {selectedMarkerId && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Items</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {items.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  className={`staff-tile${selectedItemId === i.id ? " selected" : ""}`}
                  style={{ padding: "8px 14px" }}
                  onClick={() => setSelectedItemId(i.id)}
                >
                  {i.name}
                  <div className="muted" style={{ fontSize: 10 }}>{i.itemCode}</div>
                </button>
              ))}
              <button
                type="button"
                className="staff-tile"
                style={{ padding: "8px 14px" }}
                onClick={() => setShowNewItemForm((v) => !v)}
              >
                + New item
              </button>
            </div>

            {showNewItemForm && (
              <div className="glass-card" style={{ marginTop: 10, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>New item — Item Code is assigned automatically once saved</div>
                <input placeholder="Name" value={newItemName} onChange={(e) => setNewItemName(e.target.value)} style={{ padding: 8, fontSize: 12.5 }} />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {ITEM_FIELD_DEFS.map((f) => (
                    <input
                      key={f.key}
                      placeholder={f.label}
                      type={f.type ?? "text"}
                      value={newItemFields[f.key] ?? ""}
                      onChange={(e) =>
                        setNewItemFields((prev) => ({
                          ...prev,
                          [f.key]: f.type === "number" ? (e.target.value === "" ? undefined : Number(e.target.value)) : e.target.value,
                        }))
                      }
                      style={{ padding: 8, fontSize: 12.5, width: 130 }}
                    />
                  ))}
                  <input
                    placeholder="Print Name (auto: Class + Part No + Brand, editable)"
                    value={newItemFields.printName ?? ""}
                    onChange={(e) => setNewItemFields((prev) => ({ ...prev, printName: e.target.value }))}
                    style={{ padding: 8, fontSize: 12.5, width: 280 }}
                  />
                </div>
                <div>
                  <button type="button" className="btn-primary" style={{ padding: "8px 16px" }} onClick={handleAddItem}>
                    Save item
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {selectedItem && !editingItem && (
          <div className="glass-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{selectedItem.name}</div>
                <div className="muted" style={{ fontSize: 12 }}>Item Code {selectedItem.itemCode}</div>
              </div>
              <button type="button" onClick={startEditItem} style={{ fontSize: 12, cursor: "pointer" }}>
                Edit
              </button>
            </div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12.5 }}>
              {ITEM_FIELD_DEFS.map((f) =>
                selectedItem[f.key] != null && selectedItem[f.key] !== "" ? (
                  <div key={f.key}>
                    <span className="muted">{f.label}: </span>
                    {f.type === "number" && (f.key === "rpp" || f.key === "sap") ? `Rs ${selectedItem[f.key]}` : String(selectedItem[f.key])}
                  </div>
                ) : null,
              )}
              {selectedItem.printName && (
                <div>
                  <span className="muted">Print Name: </span>
                  {selectedItem.printName}
                </div>
              )}
            </div>
          </div>
        )}

        {selectedItem && editingItem && (
          <div className="glass-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Edit item — {selectedItem.itemCode}</div>
            <input placeholder="Name" value={editItemName} onChange={(e) => setEditItemName(e.target.value)} style={{ padding: 8, fontSize: 12.5 }} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {ITEM_FIELD_DEFS.map((f) => (
                <input
                  key={f.key}
                  placeholder={f.label}
                  type={f.type ?? "text"}
                  value={editItemFields[f.key] ?? ""}
                  onChange={(e) =>
                    setEditItemFields((prev) => ({
                      ...prev,
                      // `null`, not `undefined`, when cleared — an
                      // omitted key is dropped by JSON.stringify and
                      // would silently leave the old value in place.
                      [f.key]: f.type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value,
                    }))
                  }
                  style={{ padding: 8, fontSize: 12.5, width: 130 }}
                />
              ))}
              <input
                placeholder="Print Name"
                value={editItemFields.printName ?? ""}
                onChange={(e) => setEditItemFields((prev) => ({ ...prev, printName: e.target.value }))}
                style={{ padding: 8, fontSize: 12.5, width: 280 }}
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn-primary" style={{ padding: "8px 16px" }} onClick={handleUpdateItem}>
                Save changes
              </button>
              <button type="button" onClick={() => setEditingItem(false)} style={{ padding: "8px 16px", cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {selectedItemId && (
          <div className="glass-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Control part numbers</div>

            {controlParts.map((cp) => (
              <div key={cp.id} style={{ borderBottom: "1px solid var(--line)", paddingBottom: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div>
                    <span style={{ fontFamily: "Sora, sans-serif", fontWeight: 800, fontSize: 13 }}>{cp.partNumber}</span>{" "}
                    <span style={{ fontWeight: 700, fontSize: 13.5 }}>{cp.name}</span>
                    {cp.parentPartNumber && <div className="muted" style={{ fontSize: 11 }}>Variant of {cp.parentPartNumber}</div>}
                  </div>
                  <button type="button" onClick={() => setFitmentTarget(fitmentTarget === cp.id ? null : cp.id)} style={{ fontSize: 12, cursor: "pointer" }}>
                    + Fitment
                  </button>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {cp.fitment.map((f) => (
                    <span key={f.id} style={{ fontSize: 11.5, background: "oklch(95% 0.01 260)", padding: "3px 9px", borderRadius: 999 }}>
                      {f.make} {f.model}{" "}
                      <button type="button" onClick={() => handleRemoveFitment(cp.id, f.id)} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--ink-300)" }}>
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
                {fitmentTarget === cp.id && (
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <select value={fitmentCarModelId} onChange={(e) => setFitmentCarModelId(e.target.value)} style={{ padding: 6, fontSize: 12 }}>
                      <option value="">Existing car model...</option>
                      {carModels.map((c) => (
                        <option key={c.id} value={c.id}>{c.make} {carModelLabel(c)}</option>
                      ))}
                    </select>
                    <span className="muted" style={{ fontSize: 11 }}>or new:</span>
                    <input placeholder="Make" list="known-makes" value={newCarMake} onChange={(e) => setNewCarMake(e.target.value)} style={{ width: 80, padding: 6, fontSize: 12 }} />
                    <input placeholder="Model" list="known-models" value={newCarModelName} onChange={(e) => setNewCarModelName(e.target.value)} style={{ width: 80, padding: 6, fontSize: 12 }} />
                    <input placeholder="Year from" type="number" value={newCarYearFrom} onChange={(e) => setNewCarYearFrom(e.target.value)} style={{ width: 80, padding: 6, fontSize: 12 }} />
                    <input placeholder="Year to" type="number" value={newCarYearTo} onChange={(e) => setNewCarYearTo(e.target.value)} style={{ width: 80, padding: 6, fontSize: 12 }} />
                    <button type="button" onClick={() => handleAddFitment(cp.id)} style={{ padding: "4px 10px", cursor: "pointer" }}>Add</button>
                    <datalist id="known-makes">
                      {knownMakes.map((m) => <option key={m} value={m} />)}
                    </datalist>
                    <datalist id="known-models">
                      {knownModels.map((m) => <option key={m} value={m} />)}
                    </datalist>
                  </div>
                )}
              </div>
            ))}

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <input placeholder="Part number" value={newPartNumber} onChange={(e) => setNewPartNumber(e.target.value)} style={{ padding: 8, fontSize: 12.5, width: 110 }} />
              <input placeholder="Name" value={newPartName} onChange={(e) => setNewPartName(e.target.value)} style={{ padding: 8, fontSize: 12.5, width: 160 }} />
              <select value={newPartParentId} onChange={(e) => setNewPartParentId(e.target.value)} style={{ padding: 8, fontSize: 12.5 }}>
                <option value="">No parent (base part)</option>
                {controlParts.map((cp) => (
                  <option key={cp.id} value={cp.id}>Variant of {cp.partNumber}</option>
                ))}
              </select>
              <button type="button" className="btn-primary" style={{ padding: "8px 16px" }} onClick={handleAddControlPart}>
                + New control part
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
