import { useEffect, useState } from "react";
import {
  attachFitment,
  createCarModel,
  createControlPart,
  createItem,
  createMarker,
  detachFitment,
  getCarModels,
  getControlParts,
  getItems,
  getMarkers,
  type CarModel,
  type ControlPart,
  type InventoryItem,
  type Marker,
} from "./api.js";

export function InventoryView() {
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [newMarkerName, setNewMarkerName] = useState("");

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [newItemName, setNewItemName] = useState("");

  const [controlParts, setControlParts] = useState<ControlPart[]>([]);
  const [newPartNumber, setNewPartNumber] = useState("");
  const [newPartName, setNewPartName] = useState("");
  const [newPartParentId, setNewPartParentId] = useState("");

  const [carModels, setCarModels] = useState<CarModel[]>([]);
  const [fitmentTarget, setFitmentTarget] = useState<string | null>(null);
  const [fitmentCarModelId, setFitmentCarModelId] = useState("");
  const [newCarMake, setNewCarMake] = useState("");
  const [newCarModelName, setNewCarModelName] = useState("");

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMarkers().then(setMarkers).catch((e) => setError(String(e)));
    getCarModels().then(setCarModels).catch(() => {});
  }, []);

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
      const item = await createItem(newItemName.trim(), selectedMarkerId);
      setItems((prev) => [...prev, item]);
      setNewItemName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add item");
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
        const created = await createCarModel(newCarMake.trim(), newCarModelName.trim());
        setCarModels((prev) => [...prev, created]);
        carModelId = created.id;
      }
      if (!carModelId) return;
      await attachFitment(controlPartId, carModelId);
      setFitmentCarModelId("");
      setNewCarMake("");
      setNewCarModelName("");
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
    <div style={{ display: "flex", gap: 20, padding: 24, flex: 1, overflow: "hidden" }}>
      {error && (
        <div className="error-text" style={{ position: "absolute", top: 80, right: 24 }} onClick={() => setError(null)}>
          {error}
        </div>
      )}

      <div className="glass-card" style={{ width: 260, flexShrink: 0, padding: 16, display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>
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

      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
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
                </button>
              ))}
              <div style={{ display: "flex", gap: 6 }}>
                <input placeholder="New item" value={newItemName} onChange={(e) => setNewItemName(e.target.value)} style={{ padding: 8, fontSize: 12.5 }} />
                <button type="button" onClick={handleAddItem} style={{ padding: "0 10px", cursor: "pointer" }}>+</button>
              </div>
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
                        <option key={c.id} value={c.id}>{c.make} {c.model}</option>
                      ))}
                    </select>
                    <span className="muted" style={{ fontSize: 11 }}>or new:</span>
                    <input placeholder="Make" value={newCarMake} onChange={(e) => setNewCarMake(e.target.value)} style={{ width: 80, padding: 6, fontSize: 12 }} />
                    <input placeholder="Model" value={newCarModelName} onChange={(e) => setNewCarModelName(e.target.value)} style={{ width: 80, padding: 6, fontSize: 12 }} />
                    <button type="button" onClick={() => handleAddFitment(cp.id)} style={{ padding: "4px 10px", cursor: "pointer" }}>Add</button>
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
