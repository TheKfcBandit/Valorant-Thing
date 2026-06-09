import { useState } from "react";
import { DevTab } from "../icons";
import { LogsTab } from "./dev/LogsTab";
import { GameLogTab } from "./dev/GameLogTab";
import { NotifsTab } from "./dev/NotifsTab";
import { CloudTab } from "./dev/CloudTab";
import { StateTab } from "./dev/StateTab";

const TABS = [
  { id: "logs", label: "Logs" },
  { id: "gamelog", label: "Game Log" },
  { id: "notifs", label: "Notifications" },
  { id: "cloud", label: "Cloud" },
  { id: "state", label: "State" },
];

export default function DevPage({ logs, pushNotification, addLog, onClearLogs }) {
  const [tab, setTab] = useState("logs");

  return (
    <div className="flex-1 flex flex-col min-h-0 p-4 gap-3">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <DevTab size={16} className="text-val-red" />
          <h1 className="text-sm font-display font-semibold text-text-primary">
            Developer Console
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0 border-b border-border pb-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 text-[11px] font-display font-medium rounded-md transition-colors ${
              tab === t.id
                ? "bg-val-red/20 text-val-red border border-val-red/40"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "logs" && <LogsTab logs={logs} onClear={onClearLogs} />}
      {tab === "gamelog" && <GameLogTab />}
      {tab === "notifs" && <NotifsTab pushNotification={pushNotification} />}
      {tab === "cloud" && <CloudTab addLog={addLog} />}
      {tab === "state" && <StateTab />}
    </div>
  );
}
