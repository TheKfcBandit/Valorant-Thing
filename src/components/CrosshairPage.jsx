import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { noAnim, T0 } from "../utils/animation";
import { encodeCrosshairCode, parseCrosshairCode } from "../utils/crosshair";
import { Label } from "./ui/Label";
import { CrosshairPreview } from "./crosshair/CrosshairPreview";
import { ApplyToGameDialog } from "./crosshair/ApplyToGameDialog";
import { Crosshair, Check, X } from "../icons";

// Paste / preview / preset library for crosshair share codes (#40),
// plus "Apply to game" (#45): converts a code to a Riot profile JSON
// (utils/crosshairProfile.js) and writes it into the account's
// Ares.PlayerSettings blob via the player-settings commands (#39).
//
// Storage choice: localStorage matches the existing per-page preference
// pattern (favorite_skins, instalock-config, mapdodge-config, wishlist_skins,
// etc.). The value_cache::Cache<T> rule (ARCHITECTURE.md) is for Rust-side disk
// state — crosshair presets remain pure frontend state even with #45:
// Rust never reads the preset list, the frontend converts the chosen
// code and sends the patched settings JSON over the bridge.

const PRESETS_KEY = "crosshair_presets";
const VERSION_KEY = "crosshair_presets_version";

function loadPresets() {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function savePresets(presets) {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
    localStorage.setItem(VERSION_KEY, "1");
  } catch (e) {
    console.warn("[Crosshair] persist failed:", e);
  }
}

function makeId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export default function CrosshairPage() {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [presets, setPresets] = useState(() => loadPresets());
  const [copiedId, setCopiedId] = useState(null);
  const [applyTarget, setApplyTarget] = useState(null);
  // Skip the first persist after mount: if `loadPresets()` swallowed a
  // JSON.parse error and returned [], a mounting save would overwrite the
  // corrupt-but-recoverable bytes with []. Only persist on actual user
  // changes.
  const firstPersist = useRef(true);

  useEffect(() => {
    if (firstPersist.current) {
      firstPersist.current = false;
      return;
    }
    savePresets(presets);
  }, [presets]);

  const parsed = useMemo(() => parseCrosshairCode(code), [code]);
  const isValid = parsed?.primary != null;

  const handleSave = () => {
    if (!isValid) return;
    const trimmed = name.trim() || "Untitled";
    setPresets((cur) => [
      { id: makeId(), name: trimmed, code: encodeCrosshairCode(parsed), createdMs: Date.now() },
      ...cur,
    ]);
    setName("");
  };

  const handleDelete = (id) => {
    setPresets((cur) => cur.filter((p) => p.id !== id));
  };

  const handleCopy = async (preset) => {
    try {
      await navigator.clipboard.writeText(preset.code);
      setCopiedId(preset.id);
      setTimeout(() => setCopiedId((cur) => (cur === preset.id ? null : cur)), 1500);
    } catch (e) {
      console.warn("[Crosshair] copy failed:", e);
    }
  };

  const handleLoadPreset = (preset) => {
    setCode(preset.code);
    setName(preset.name);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={noAnim() ? T0 : { duration: 0.2 }}
      className="flex-1 flex flex-col min-h-0 overflow-y-auto p-4 gap-4"
    >
      <header className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-val-red/10 border border-val-red/30 flex items-center justify-center shrink-0">
          <Crosshair size={20} className="text-val-red" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold text-text-primary">Crosshair</h1>
          <p className="text-xs text-text-muted">
            Paste a share code to preview. Save as a named preset; copy it back to import in-game.
          </p>
        </div>
      </header>

      <section className="rounded-xl border border-border bg-base-700 p-4 grid grid-cols-[auto_1fr] gap-4">
        <CrosshairPreview profile={parsed?.primary} size={160} />
        <div className="min-w-0 space-y-2">
          <Label>Share code</Label>
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="0;P;c;5;h;0;0t;1;0l;3;0o;2;0a;1…"
            spellCheck={false}
            className="w-full h-20 px-3 py-2 bg-base-600 border border-border rounded-lg text-xs font-mono text-text-primary placeholder:text-text-muted/40 outline-none focus:border-val-red/60 transition-colors resize-none"
          />
          {code && !isValid && (
            <p className="text-[11px] font-body text-val-red">
              That doesn&apos;t look like a valid crosshair code. Paste the full string copied from
              the in-game crosshair settings.
            </p>
          )}
          <div className="flex items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Preset name"
              className="flex-1 px-3 py-2 bg-base-600 border border-border rounded-lg text-xs font-body text-text-primary placeholder:text-text-muted/40 outline-none focus:border-val-red/60 transition-colors"
            />
            <button
              type="button"
              onClick={handleSave}
              disabled={!isValid}
              className="shrink-0 px-3 py-2 rounded-lg border border-val-red/40 bg-val-red/20 text-val-red font-display font-semibold text-xs hover:bg-val-red/30 disabled:opacity-40 disabled:hover:bg-val-red/20 transition-colors"
            >
              Save preset
            </button>
            <button
              type="button"
              onClick={() =>
                setApplyTarget({
                  code: encodeCrosshairCode(parsed),
                  name: name.trim() || "Imported",
                })
              }
              disabled={!isValid}
              title="Add this crosshair to your in-game profiles"
              className="shrink-0 px-3 py-2 rounded-lg border border-border bg-base-600 text-text-primary font-display font-semibold text-xs hover:bg-base-500 disabled:opacity-40 transition-colors"
            >
              Apply to game
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <Label>Presets</Label>
        {presets.length === 0 ? (
          <p className="text-xs font-body text-text-muted">
            No presets yet. Paste a code above and click{" "}
            <span className="text-text-secondary">Save preset</span>.
          </p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {presets.map((p) => (
              <PresetCard
                key={p.id}
                preset={p}
                copied={copiedId === p.id}
                onCopy={() => handleCopy(p)}
                onLoad={() => handleLoadPreset(p)}
                onDelete={() => handleDelete(p.id)}
                onApply={() => setApplyTarget({ code: p.code, name: p.name })}
              />
            ))}
          </ul>
        )}
      </section>

      {applyTarget && (
        <ApplyToGameDialog
          code={applyTarget.code}
          name={applyTarget.name}
          onClose={() => setApplyTarget(null)}
        />
      )}
    </motion.div>
  );
}

function PresetCard({ preset, copied, onCopy, onLoad, onDelete, onApply }) {
  const parsed = useMemo(() => parseCrosshairCode(preset.code), [preset.code]);
  return (
    <li className="rounded-xl border border-border bg-base-700 p-3 flex gap-3">
      <button
        type="button"
        onClick={onLoad}
        title="Load into the editor"
        className="shrink-0 rounded-md focus:outline-none focus:ring-2 focus:ring-val-red/60"
      >
        <CrosshairPreview profile={parsed?.primary} size={88} />
      </button>
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <p className="text-sm font-display font-semibold text-text-primary truncate">
          {preset.name}
        </p>
        <p className="text-[10px] font-mono text-text-muted truncate" title={preset.code}>
          {preset.code}
        </p>
        <div className="mt-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={onCopy}
            className={`text-[10px] font-display font-bold uppercase tracking-wider px-2 py-1 rounded border transition-colors ${
              copied
                ? "border-green-500/40 bg-green-500/15 text-green-300"
                : "border-border bg-base-600 text-text-secondary hover:bg-base-500"
            }`}
          >
            {copied ? (
              <span className="inline-flex items-center gap-1">
                <Check size={10} /> Copied
              </span>
            ) : (
              "Copy code"
            )}
          </button>
          <button
            type="button"
            onClick={onApply}
            title="Add this crosshair to your in-game profiles"
            className="text-[10px] font-display font-bold uppercase tracking-wider px-2 py-1 rounded border border-border bg-base-600 text-text-secondary hover:bg-base-500 transition-colors"
          >
            <span className="inline-flex items-center gap-1">
              <Crosshair size={10} /> Apply
            </span>
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="Delete preset"
            aria-label="Delete preset"
            className="text-[10px] font-display font-bold uppercase tracking-wider px-2 py-1 rounded border border-border bg-base-600 text-text-muted hover:text-val-red hover:bg-base-500 transition-colors"
          >
            <X size={10} />
          </button>
        </div>
      </div>
    </li>
  );
}
