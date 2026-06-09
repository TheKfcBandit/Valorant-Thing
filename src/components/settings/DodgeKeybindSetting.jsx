import { useState, useCallback } from "react";
import { Toggle } from "../ui/Toggle";

const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta"]);
const KEY_MAP = { Control: "Ctrl", Meta: "Super", " ": "Space" };

export function DodgeKeybindSetting() {
  const [enabled, setEnabled] = useState(
    () => localStorage.getItem("dodge_keybind_enabled") !== "false"
  );
  const [keybind, setKeybind] = useState(() => localStorage.getItem("dodge_keybind") || "Ctrl+D");
  const [recording, setRecording] = useState(false);

  const handleToggle = useCallback((v) => {
    setEnabled(v);
    localStorage.setItem("dodge_keybind_enabled", String(v));
  }, []);

  const handleRecord = useCallback(() => {
    setRecording(true);
    const handler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (MODIFIER_KEYS.has(e.key)) return;
      const parts = [];
      if (e.ctrlKey) parts.push("Ctrl");
      if (e.shiftKey) parts.push("Shift");
      if (e.altKey) parts.push("Alt");
      parts.push(KEY_MAP[e.key] || e.key.toUpperCase());
      const combo = parts.join("+");
      setKeybind(combo);
      localStorage.setItem("dodge_keybind", combo);
      setRecording(false);
      window.removeEventListener("keydown", handler, true);
    };
    window.addEventListener("keydown", handler, true);
  }, []);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-body text-text-muted">Dodge keybind</p>
        <Toggle enabled={enabled} onChange={handleToggle} />
      </div>
      {enabled && (
        <>
          <button
            onClick={handleRecord}
            className={`w-full px-3 py-2 rounded-lg text-xs font-body text-left transition-colors border ${
              recording
                ? "bg-val-red/10 border-val-red/40 text-val-red animate-pulse"
                : "bg-base-600 border-border text-text-secondary hover:text-text-primary hover:bg-base-500"
            }`}
          >
            {recording ? "Press a key combo..." : keybind}
          </button>
          <p className="text-[10px] font-body text-text-muted">
            Works globally while in agent select
          </p>
        </>
      )}
    </div>
  );
}
