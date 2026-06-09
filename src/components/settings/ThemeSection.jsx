import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { noAnim, T0 } from "../../utils/animation";
import { presetToCustom, buildPreviewGradient } from "../../utils/customTheme";
import { readVtFile, exportVtFile } from "../../cloud";
import { THEMES } from "../../themes";
import { Label } from "../ui/Label";
import { ColorSwatch } from "./ColorSwatch";
import { SettingRow } from "./SettingRow";
import { ChevronDown, DownloadTray, Layers, Pencil, Plus, Share, UploadTray, X } from "../../icons";

export function ThemeSection({
  theme,
  onThemeChange,
  customTheme,
  onCustomThemeChange,
  simplifiedTheme,
  onSimplifiedThemeChange,
  onShareTheme,
  onOpenImportCode,
}) {
  const [presetOpen, setPresetOpen] = useState(false);
  const themeVtRef = useRef(null);

  const exportThemeFile = () => exportVtFile("theme", customTheme, "custom-theme.vt");

  const importThemeVt = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const vt = await readVtFile(file);
      if (vt.type !== "theme") return;
      const d = vt.data;
      if (d.accent && d.stops?.length >= 2 && typeof d.angle === "number") {
        onCustomThemeChange(d);
        onThemeChange("custom");
      }
    } catch (e) {
      console.warn("[Settings] suppressed:", e);
    }
    e.target.value = "";
  };

  const clearVarsAndUpdate = (patch) => {
    const { vars, ...rest } = customTheme;
    onCustomThemeChange({ ...rest, ...patch });
  };

  const updateStop = (i, patch) => {
    const stops = customTheme.stops.map((s, j) => (j === i ? { ...s, ...patch } : s));
    clearVarsAndUpdate({ stops });
  };

  const removeStop = (i) => {
    if (customTheme.stops.length <= 2) return;
    clearVarsAndUpdate({ stops: customTheme.stops.filter((_, j) => j !== i) });
  };

  const addStop = () => {
    const sorted = [...customTheme.stops].sort((a, b) => a.pos - b.pos);
    let pos = 50;
    if (sorted.length >= 2) {
      let maxGap = 0,
        gapMid = 50;
      for (let i = 0; i < sorted.length - 1; i++) {
        const gap = sorted[i + 1].pos - sorted[i].pos;
        if (gap > maxGap) {
          maxGap = gap;
          gapMid = Math.round((sorted[i].pos + sorted[i + 1].pos) / 2);
        }
      }
      pos = gapMid;
    }
    clearVarsAndUpdate({ stops: [...customTheme.stops, { color: "#444444", pos }] });
  };

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
      transition={noAnim() ? T0 : { duration: 0.2 }}
      className="rounded-xl bg-base-700 border border-border divide-y divide-border"
    >
      <div className="px-4 pt-3 pb-1">
        <Label as="h2">Theme</Label>
      </div>
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-4 gap-2">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => onThemeChange(t.id)}
              className={`group relative p-2 rounded-lg border transition-all duration-150 ${
                theme === t.id
                  ? "border-val-red bg-base-600"
                  : "border-transparent hover:bg-base-600/50"
              }`}
            >
              <div
                className="w-full h-8 rounded-md mb-1.5"
                style={{ background: `linear-gradient(135deg, ${t.bg} 0%, ${t.accent} 100%)` }}
              />
              <p
                className={`text-[11px] font-body leading-tight truncate ${
                  theme === t.id
                    ? "text-text-primary font-medium"
                    : "text-text-muted group-hover:text-text-secondary"
                }`}
              >
                {t.name}
              </p>
            </button>
          ))}
          <button
            onClick={() => onThemeChange("custom")}
            className={`group relative p-2 rounded-lg border transition-all duration-150 ${
              theme === "custom"
                ? "border-val-red bg-base-600"
                : "border-transparent hover:bg-base-600/50"
            }`}
          >
            <div
              className="w-full h-8 rounded-md mb-1.5 flex items-center justify-center"
              style={{ background: buildPreviewGradient(customTheme) }}
            >
              <Pencil size={14} stroke="white" className="opacity-60" />
            </div>
            <p
              className={`text-[11px] font-body leading-tight truncate ${
                theme === "custom"
                  ? "text-text-primary font-medium"
                  : "text-text-muted group-hover:text-text-secondary"
              }`}
            >
              Custom
            </p>
          </button>
        </div>

        {theme === "custom" && (
          <div className="space-y-3 pt-2 border-t border-border">
            <div
              className="h-14 rounded-xl border border-border shadow-inner"
              style={{ background: buildPreviewGradient(customTheme) }}
            />

            <div className="space-y-2">
              <p className="text-xs font-display font-medium text-text-secondary uppercase tracking-wider">
                Color Stops
              </p>
              {customTheme.stops.map((stop, i) => (
                <div key={i} className="flex items-center gap-2.5 group">
                  <ColorSwatch color={stop.color} onChange={(c) => updateStop(i, { color: c })} />
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={stop.pos}
                    onChange={(e) => updateStop(i, { pos: parseInt(e.target.value, 10) })}
                    className="flex-1"
                  />
                  <span className="text-xs font-body text-text-muted w-9 text-right tabular-nums">
                    {stop.pos}%
                  </span>
                  {customTheme.stops.length > 2 && (
                    <button
                      onClick={() => removeStop(i)}
                      className="w-6 h-6 rounded-md flex items-center justify-center text-text-muted hover:text-status-red hover:bg-status-red/10 transition-colors shrink-0 opacity-0 group-hover:opacity-100"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={addStop}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-body text-val-red hover:bg-val-red/10 transition-colors"
              >
                <Plus />
                Add Color Stop
              </button>
            </div>

            <div className="flex items-center gap-3">
              <p className="text-xs font-display font-medium text-text-secondary uppercase tracking-wider shrink-0 w-12">
                Angle
              </p>
              <input
                type="range"
                min={0}
                max={360}
                value={customTheme.angle}
                onChange={(e) => clearVarsAndUpdate({ angle: parseInt(e.target.value, 10) })}
                className="flex-1"
              />
              <span className="text-xs font-body text-text-muted w-9 text-right tabular-nums">
                {customTheme.angle}°
              </span>
            </div>

            <div className="flex items-center gap-3">
              <p className="text-xs font-display font-medium text-text-secondary uppercase tracking-wider shrink-0 w-12">
                Accent
              </p>
              <ColorSwatch
                color={customTheme.accent}
                onChange={(c) => clearVarsAndUpdate({ accent: c })}
              />
              <p className="text-[11px] font-body text-text-muted">UI highlights, toggles, icons</p>
            </div>

            <div className="flex items-center gap-2 pt-3 border-t border-border">
              <div className="relative">
                <button
                  onClick={() => setPresetOpen(!presetOpen)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-base-600 border border-border text-xs font-body text-text-primary hover:bg-base-500 transition-colors"
                >
                  <Layers />
                  Load Preset
                  <ChevronDown
                    strokeWidth="2.5"
                    className={`transition-transform ${presetOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {presetOpen && (
                  <div className="absolute bottom-full left-0 mb-1 w-44 py-1 rounded-lg bg-base-600 border border-border shadow-xl z-10">
                    {THEMES.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => {
                          onCustomThemeChange(presetToCustom(t));
                          setPresetOpen(false);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs font-body text-text-secondary hover:text-text-primary hover:bg-base-500/60 transition-colors"
                      >
                        <div
                          className="w-4 h-4 rounded shrink-0 border border-white/10"
                          style={{ background: `linear-gradient(135deg, ${t.bg}, ${t.accent})` }}
                        />
                        {t.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={onShareTheme}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-base-600 border border-border text-xs font-body text-text-primary hover:bg-base-500 transition-colors"
              >
                <Share />
                Share Code
              </button>
              <button
                onClick={() => onOpenImportCode("theme")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-base-600 border border-border text-xs font-body text-text-primary hover:bg-base-500 transition-colors"
              >
                <UploadTray />
                Import Code
              </button>
              <button
                onClick={exportThemeFile}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-base-600 border border-border text-xs font-body text-text-primary hover:bg-base-500 transition-colors"
              >
                <DownloadTray />
                Export .vt
              </button>
              <button
                onClick={() => themeVtRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-base-600 border border-border text-xs font-body text-text-primary hover:bg-base-500 transition-colors"
              >
                <UploadTray />
                Import .vt
              </button>
              <input
                ref={themeVtRef}
                type="file"
                accept=".vt,.theme,.json"
                onChange={importThemeVt}
                className="hidden"
              />
            </div>
          </div>
        )}
      </div>
      <SettingRow
        title="Simplified"
        desc="Flat colors instead of gradient background"
        enabled={simplifiedTheme}
        onChange={onSimplifiedThemeChange}
      />
    </motion.div>
  );
}
