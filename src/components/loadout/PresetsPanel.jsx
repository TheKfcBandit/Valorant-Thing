import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

// Owns the preset list and CRUD round-trips; the page only learns about an
// applied preset via onApplied (success toast + live-loadout refetch).
export function PresetsPanel({ onApplied }) {
  const [presets, setPresets] = useState([]);
  const [presetName, setPresetName] = useState("");
  const [presetBusy, setPresetBusy] = useState(false);
  const [presetError, setPresetError] = useState(null);

  const refreshPresets = useCallback(async () => {
    try {
      const list = await invoke("list_loadout_presets");
      setPresets(Array.isArray(list) ? list : []);
    } catch (e) {
      console.warn("[Presets] list failed:", e);
    }
  }, []);

  useEffect(() => {
    refreshPresets();
  }, [refreshPresets]);

  const savePreset = useCallback(async () => {
    const name = presetName.trim();
    if (!name || presetBusy) return;
    setPresetError(null);
    setPresetBusy(true);
    try {
      await invoke("save_loadout_preset", { name });
      setPresetName("");
      await refreshPresets();
    } catch (e) {
      setPresetError(typeof e === "string" ? e : e?.message || "Save failed");
    } finally {
      setPresetBusy(false);
    }
  }, [presetName, presetBusy, refreshPresets]);

  const applyPreset = useCallback(
    async (id) => {
      if (presetBusy) return;
      setPresetError(null);
      setPresetBusy(true);
      try {
        await invoke("apply_loadout_preset", { presetId: id });
        // Refresh the live loadout so the rest of the page reflects the change.
        await onApplied?.();
      } catch (e) {
        setPresetError(typeof e === "string" ? e : e?.message || "Apply failed");
      } finally {
        setPresetBusy(false);
      }
    },
    [presetBusy, onApplied]
  );

  const deletePreset = useCallback(
    async (id) => {
      if (presetBusy) return;
      setPresetError(null);
      setPresetBusy(true);
      try {
        await invoke("delete_loadout_preset", { presetId: id });
        await refreshPresets();
      } catch (e) {
        setPresetError(typeof e === "string" ? e : e?.message || "Delete failed");
      } finally {
        setPresetBusy(false);
      }
    },
    [presetBusy, refreshPresets]
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-display font-bold text-text-muted uppercase tracking-widest">
          Presets
        </div>
        {presetError && (
          <span className="text-[10px] text-red-400 truncate max-w-[180px]">{presetError}</span>
        )}
      </div>
      <div className="rounded-lg border border-border bg-base-700/40 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") savePreset();
            }}
            placeholder="Name your current loadout..."
            className="flex-1 px-2.5 py-1.5 bg-base-800 border border-border rounded text-xs font-body text-text-primary placeholder:text-text-muted/50 outline-none focus:border-val-red/60"
            maxLength={60}
          />
          <button
            onClick={savePreset}
            disabled={presetBusy || !presetName.trim()}
            className="px-3 py-1.5 rounded text-[10px] font-display font-bold uppercase tracking-wider border border-val-red/40 bg-val-red/20 hover:bg-val-red/30 text-val-red disabled:opacity-50"
          >
            Save current
          </button>
        </div>
        {presets.length === 0 ? (
          <p className="text-[10px] font-body text-text-muted">
            No presets yet. Save your current loadout to recall it later.
          </p>
        ) : (
          <ul className="space-y-1">
            {presets.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded bg-base-800 border border-border"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-display font-semibold text-text-primary truncate">
                    {p.name}
                  </p>
                  <p className="text-[9px] font-body text-text-muted">
                    Saved {new Date(p.saved_at_ms).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => applyPreset(p.id)}
                  disabled={presetBusy}
                  className="px-2 py-1 rounded text-[10px] font-display font-semibold border border-val-red/40 bg-val-red/10 text-val-red hover:bg-val-red/20 disabled:opacity-50"
                >
                  Apply
                </button>
                <button
                  onClick={() => deletePreset(p.id)}
                  disabled={presetBusy}
                  className="px-2 py-1 rounded text-[10px] font-display font-semibold border border-border bg-base-600 hover:bg-base-500 text-text-secondary disabled:opacity-50"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
