import { useState } from "react";

const NOTIF_PRESETS = [
  {
    label: "Locking Agent",
    desc: "Countdown timer notification",
    build: () => ({
      id: `dev-lock-${Date.now()}`,
      type: "locking",
      agentName: "Reyna",
      totalMs: 3000,
      startTime: Date.now(),
    }),
  },
  {
    label: "Agent Locked",
    desc: "Success confirmation",
    build: () => ({ id: `dev-locked-${Date.now()}`, type: "locked", agentName: "Reyna" }),
  },
  {
    label: "Match Found (Competitive)",
    desc: "With map image, server, dodge keybind",
    build: () => ({
      id: `dev-match-${Date.now()}`,
      type: "match-found",
      mapName: "Ascent",
      mapImage:
        "https://media.valorant-api.com/maps/7eaecc1b-4337-bbf6-6ab9-04b8f06b3319/listviewicon.png",
      server: "US Central (Texas)",
      canDodge: true,
      dodgeKeybind: localStorage.getItem("dodge_keybind") || "Ctrl+D",
    }),
  },
  {
    label: "Match Found (Deathmatch)",
    desc: "No dodge option",
    build: () => ({
      id: `dev-match-${Date.now()}`,
      type: "match-found",
      mapName: "Breeze",
      mapImage:
        "https://media.valorant-api.com/maps/2fb9a4fd-47b8-4e7d-a969-74b4046ebd53/listviewicon.png",
      server: "US East (Virginia)",
      canDodge: false,
    }),
  },
  {
    label: "Dodged (Map)",
    desc: "Auto-dodged blacklisted map",
    build: () => ({
      id: `dev-dodge-${Date.now()}`,
      type: "dodged",
      reason: "map",
      mapName: "Breeze",
    }),
  },
  {
    label: "Dodged (Keybind)",
    desc: "Manual dodge via keybind",
    build: () => ({
      id: `dev-dodge-${Date.now()}`,
      type: "dodged",
      reason: "keybind",
      keybind: localStorage.getItem("dodge_keybind") || "Ctrl+D",
    }),
  },
  {
    label: "Dodged (Manual)",
    desc: "Button dodge",
    build: () => ({ id: `dev-dodge-${Date.now()}`, type: "dodged", reason: "manual" }),
  },
  {
    label: "Left Queue",
    desc: "Auto-unqueue after dodge",
    build: () => ({ id: `dev-queue-${Date.now()}`, type: "queue", action: "unqueue" }),
  },
  {
    label: "Requeued",
    desc: "Auto-requeue after match",
    build: () => ({ id: `dev-queue-${Date.now()}`, type: "queue", action: "requeue" }),
  },
];

export function NotifsTab({ pushNotification }) {
  const [customAgent, setCustomAgent] = useState("Jett");
  const [customDelay, setCustomDelay] = useState(3000);
  const [sent, setSent] = useState(null);

  const send = (preset) => {
    const data = preset.build();
    if (data.agentName && data.type === "locking") {
      data.agentName = customAgent;
      data.totalMs = customDelay;
      data.startTime = Date.now();
    }
    if (data.agentName && data.type === "locked") {
      data.agentName = customAgent;
    }
    pushNotification(data);
    setSent(preset.label);
    setTimeout(() => setSent(null), 1500);
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto space-y-4">
      <div className="rounded-lg bg-base-800 border border-border p-3 space-y-3">
        <p className="text-[10px] font-display font-bold text-text-muted uppercase tracking-wider">
          Custom Values
        </p>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label className="text-[10px] font-body text-text-muted mb-1 block">Agent Name</label>
            <input
              value={customAgent}
              onChange={(e) => setCustomAgent(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-base-700 border border-border rounded text-xs font-body text-text-primary outline-none focus:border-val-red/60 transition-colors"
            />
          </div>
          <div className="w-32">
            <label className="text-[10px] font-body text-text-muted mb-1 block">
              Lock Delay (ms)
            </label>
            <input
              type="number"
              value={customDelay}
              onChange={(e) => setCustomDelay(Number(e.target.value))}
              className="w-full px-2.5 py-1.5 bg-base-700 border border-border rounded text-xs font-body text-text-primary outline-none focus:border-val-red/60 transition-colors"
            />
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <p className="text-[10px] font-display font-bold text-text-muted uppercase tracking-wider">
            Notification Presets
          </p>
          {sent && <span className="text-[10px] font-body text-status-green">Sent: {sent}</span>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {NOTIF_PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => send(preset)}
              className="text-left p-3 rounded-lg bg-base-800 border border-border hover:border-val-red/40 hover:bg-base-700 transition-colors group"
            >
              <p className="text-xs font-display font-medium text-text-primary group-hover:text-val-red transition-colors">
                {preset.label}
              </p>
              <p className="text-[10px] font-body text-text-muted mt-0.5">{preset.desc}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
