import { useState, useRef, useEffect, useCallback } from "react";
import { HexColorPicker, HexColorInput } from "react-colorful";

export function ColorSwatch({ color, onChange, className = "" }) {
  const [open, setOpen] = useState(false);
  const popover = useRef(null);

  const close = useCallback((e) => {
    if (popover.current && !popover.current.contains(e.target)) setOpen(false);
  }, []);

  useEffect(() => {
    if (open) document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open, close]);

  return (
    <div className={`relative ${className}`} ref={popover}>
      <button
        onClick={() => setOpen(!open)}
        className="w-8 h-8 rounded-lg border border-white/10 shadow-sm hover:border-white/25 transition-colors cursor-pointer shrink-0"
        style={{ background: color }}
      />
      {open && (
        <div
          className="absolute z-20 top-full left-0 mt-2 p-3 rounded-xl bg-base-600 border border-border shadow-2xl space-y-2"
          style={{ width: 224 }}
        >
          <HexColorPicker color={color} onChange={onChange} />
          <div className="flex items-center gap-2">
            <span className="text-xs font-body text-text-muted">#</span>
            <HexColorInput
              color={color}
              onChange={onChange}
              prefixed={false}
              className="flex-1 px-2 py-1 rounded-md bg-base-700 border border-border text-xs font-body text-text-primary outline-none focus:border-val-red/60 transition-colors uppercase tracking-wider"
            />
          </div>
        </div>
      )}
    </div>
  );
}
