import { useState, useEffect, useRef } from "react";
import Tooltip from "../Tooltip";
import { ChevronDown } from "../../icons";

export const inputClass =
  "w-full px-2.5 py-1.5 bg-base-800 border border-border rounded-lg text-xs font-body text-text-primary placeholder:text-text-muted/40 outline-none focus:border-val-red/60 transition-colors";

export function NumInput({ value, onChange, className, ...props }) {
  const [local, setLocal] = useState(String(value));
  useEffect(() => {
    setLocal(String(value));
  }, [value]);
  return (
    <input
      type="number"
      value={local}
      onChange={(e) => {
        setLocal(e.target.value);
        if (e.target.value !== "") onChange(Number(e.target.value));
      }}
      onBlur={() => {
        if (local === "") {
          setLocal(String(value));
        }
      }}
      className={className}
      {...props}
    />
  );
}

export function Field({ label, children, tooltip }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <label className="text-[10px] font-body text-text-muted uppercase tracking-wider">
          {label}
        </label>
        {tooltip && (
          <Tooltip text={tooltip}>
            <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-base-500/50 text-[8px] font-bold text-text-muted/70 cursor-help select-none leading-none">
              ?
            </span>
          </Tooltip>
        )}
      </div>
      {children}
    </div>
  );
}

export function CustomSelect({ value, onChange, options, renderOption }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const btnRef = useRef(null);
  const dropRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const selected = options.find((o) => o.id === value || o.tier === value) || options[0];

  useEffect(() => {
    const handler = (e) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target) &&
        dropRef.current &&
        !dropRef.current.contains(e.target)
      )
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onScroll = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [open]);

  useEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const maxH = 256;
    const spaceBelow = window.innerHeight - r.bottom - 8;
    if (spaceBelow >= 80) {
      setPos({ top: r.bottom + 4, left: r.left, width: r.width, maxH: Math.min(maxH, spaceBelow) });
    } else {
      const spaceAbove = r.top - 8;
      const h = Math.min(maxH, spaceAbove);
      setPos({ top: r.top - h - 4, left: r.left, width: r.width, maxH: h });
    }
  }, [open]);

  const valKey = selected.tier !== undefined ? "tier" : "id";

  return (
    <div ref={containerRef}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 bg-base-800 border border-border rounded-lg text-xs font-body text-text-primary hover:border-val-red/40 transition-colors"
      >
        <span className="flex-1 text-left flex items-center gap-2">
          {renderOption ? renderOption(selected) : selected.name || selected.label}
        </span>
        <ChevronDown
          className={`text-text-muted transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div
          ref={dropRef}
          className="fixed z-[9999] bg-base-800 border border-border rounded-lg shadow-xl overflow-y-auto"
          style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxH }}
        >
          {options.map((o) => (
            <button
              key={o[valKey]}
              onClick={() => {
                onChange(o[valKey]);
                setOpen(false);
              }}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs font-body hover:bg-base-600 transition-colors ${o[valKey] === value ? "bg-base-600 text-text-primary" : "text-text-secondary"}`}
            >
              {renderOption ? renderOption(o) : o.name || o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
