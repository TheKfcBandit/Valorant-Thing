import { useState } from "react";
import MatchInfoPage from "./MatchInfoPage";
import PartyPage from "./PartyPage";

// LivePage stitches the two pre-existing surfaces (active-match view and
// party view) under a single tab with pill switching. Each child component
// keeps its own state, polling, and rendering — we just expose them in one
// place so the sidebar isn't split.
export default function LivePage({ splooshimaApiKey, splooshimaAvailable, player, connected, addLog, onRefresh }) {
  const [view, setView] = useState("match");

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-4 pt-3 pb-2 flex items-center gap-1.5 border-b border-border">
        <PillButton active={view === "match"} onClick={() => setView("match")} activeColor="text-accent-blue">
          Active Match
        </PillButton>
        <PillButton active={view === "party"} onClick={() => setView("party")} activeColor="text-val-red">
          Party
        </PillButton>
      </div>
      {view === "match" ? (
        <MatchInfoPage
          splooshimaApiKey={splooshimaApiKey}
          splooshimaAvailable={splooshimaAvailable}
          player={player}
          connected={connected}
          addLog={addLog}
        />
      ) : (
        <PartyPage connected={connected} addLog={addLog} onRefresh={onRefresh} />
      )}
    </div>
  );
}

function PillButton({ active, onClick, children, activeColor }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-xs font-display font-semibold border transition-colors ${
        active
          ? `border-current/40 bg-current/10 ${activeColor}`
          : "border-border bg-base-700 text-text-secondary hover:text-text-primary hover:bg-base-600"
      }`}
    >
      {children}
    </button>
  );
}
