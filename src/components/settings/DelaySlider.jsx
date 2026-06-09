import { useState, useEffect } from "react";

export function DelaySlider({ label, desc, value, onChange }) {
  const [local, setLocal] = useState(String(value));
  useEffect(() => {
    setLocal(String(value));
  }, [value]);
  const clamp = (v) => Math.max(0, Math.min(10000, v));
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-display font-medium text-text-primary">{label}</p>
        <p className="text-xs font-body text-text-muted mt-0.5">{desc}</p>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={0}
          max={10000}
          step={100}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          className="w-24 h-1.5 rounded-full appearance-none cursor-pointer bg-base-500 accent-val-red"
        />
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={local}
            onChange={(e) => {
              setLocal(e.target.value);
              if (e.target.value !== "") onChange(clamp(parseInt(e.target.value, 10) || 0));
            }}
            onBlur={() => {
              if (local === "") setLocal(String(value));
            }}
            className="w-14 px-1.5 py-0.5 rounded bg-base-600 border border-border text-text-primary text-xs text-right font-body tabular-nums outline-none focus:border-val-red/60 transition-colors [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <span className="text-xs font-body text-text-muted">ms</span>
        </div>
      </div>
    </div>
  );
}
