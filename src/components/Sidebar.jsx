import { motion, AnimatePresence } from "framer-motion";
import PlayerInfo from "./PlayerInfo";
import {
  CoachTab,
  Crosshair,
  DevTab,
  FakeStatusTab,
  HeatmapTab,
  HomeTab,
  InstalockTab,
  LineupsTab,
  LiveTab,
  LoadoutTab,
  LogsTab,
  MapDodgeTab,
  MiscTab,
  PremierTab,
  Refresh,
  Settings,
  StoreTab,
  WrappedTab,
} from "../icons";

function SectionLabel({ children }) {
  return (
    <p className="px-3 pt-2 pb-1 text-[9px] font-display font-bold text-text-muted/70 uppercase tracking-widest first:pt-0">
      {children}
    </p>
  );
}

function NavButton({ id, label, icon, activeTab, onTabChange, activeColor = "text-val-red" }) {
  const isActive = activeTab === id;
  return (
    <button
      onClick={() => onTabChange(id)}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-body transition-colors duration-150 relative ${
        isActive
          ? "text-text-primary"
          : "text-text-secondary hover:text-text-primary hover:bg-base-600/40"
      }`}
    >
      {isActive && (
        <motion.div
          layoutId="sidebar-active"
          className="absolute inset-0 rounded-lg bg-base-500/60"
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
        />
      )}
      <span className={`relative z-10 ${isActive ? activeColor : "text-text-muted"}`}>{icon}</span>
      <span className="relative z-10">{label}</span>
    </button>
  );
}

export default function Sidebar({
  status,
  player,
  onReconnect,
  activeTab,
  onTabChange,
  showLogs,
  devTab,
  pregameMatchId,
  onDodge,
  simplifiedTheme = true,
}) {
  return (
    <div
      className={`w-52 border-r border-border flex flex-col shrink-0 relative ${simplifiedTheme ? "bg-base-700" : ""}`}
    >
      {/* min-h-0 lets the nav shrink and scroll instead of overflowing the
          column and pushing the connection bar below the window edge. */}
      <nav className="p-2 pt-3 space-y-0.5 flex-1 min-h-0 overflow-y-auto">
        <SectionLabel>Home</SectionLabel>
        <NavButton
          id="home"
          label="Home"
          activeTab={activeTab}
          onTabChange={onTabChange}
          icon={<HomeTab />}
        />

        <SectionLabel>Live</SectionLabel>
        <NavButton
          id="live"
          label="Live"
          activeTab={activeTab}
          onTabChange={onTabChange}
          activeColor="text-accent-blue"
          icon={<LiveTab />}
        />
        <NavButton
          id="premier"
          label="Premier"
          activeTab={activeTab}
          onTabChange={onTabChange}
          icon={<PremierTab />}
        />

        <SectionLabel>Items</SectionLabel>
        <NavButton
          id="store"
          label="Store"
          activeTab={activeTab}
          onTabChange={onTabChange}
          icon={<StoreTab />}
        />
        <NavButton
          id="loadout"
          label="Loadout"
          activeTab={activeTab}
          onTabChange={onTabChange}
          icon={<LoadoutTab />}
        />
        <NavButton
          id="crosshair"
          label="Crosshair"
          activeTab={activeTab}
          onTabChange={onTabChange}
          icon={<Crosshair size={18} />}
        />

        <SectionLabel>Tools</SectionLabel>
        <NavButton
          id="instalock"
          label="Instalock"
          activeTab={activeTab}
          onTabChange={onTabChange}
          icon={<InstalockTab />}
        />
        <NavButton
          id="mapdodge"
          label="Map Dodge"
          activeTab={activeTab}
          onTabChange={onTabChange}
          icon={<MapDodgeTab size={18} />}
        />
        <NavButton
          id="fakestatus"
          label="Fake Status"
          activeTab={activeTab}
          onTabChange={onTabChange}
          icon={<FakeStatusTab />}
        />
        <NavButton
          id="misc"
          label="Misc"
          activeTab={activeTab}
          onTabChange={onTabChange}
          icon={<MiscTab />}
        />

        <SectionLabel>Insights</SectionLabel>
        <NavButton
          id="heatmap"
          label="Heatmap"
          activeTab={activeTab}
          onTabChange={onTabChange}
          icon={<HeatmapTab />}
        />
        <NavButton
          id="lineups"
          label="Lineups"
          activeTab={activeTab}
          onTabChange={onTabChange}
          icon={<LineupsTab />}
        />
        <NavButton
          id="wrapped"
          label="Wrapped"
          activeTab={activeTab}
          onTabChange={onTabChange}
          icon={<WrappedTab />}
        />
        <NavButton
          id="coach"
          label="AI Coach"
          activeTab={activeTab}
          onTabChange={onTabChange}
          icon={<CoachTab />}
        />
        {showLogs && (
          <NavButton
            id="logs"
            label="Logs"
            activeTab={activeTab}
            onTabChange={onTabChange}
            activeColor="text-accent-blue"
            icon={<LogsTab />}
          />
        )}
        {devTab && (
          <NavButton
            id="dev"
            label="Dev"
            activeTab={activeTab}
            onTabChange={onTabChange}
            activeColor="text-val-red"
            icon={<DevTab />}
          />
        )}
      </nav>

      <div className="p-3 border-t border-border space-y-2 shrink-0">
        <AnimatePresence>
          {pregameMatchId && (
            <motion.button
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              onClick={onDodge}
              className="w-full py-1.5 rounded-lg bg-val-red/20 hover:bg-val-red/30 border border-val-red/40 text-val-red text-xs font-display font-semibold tracking-wide transition-colors duration-150"
            >
              Dodge
            </motion.button>
          )}
        </AnimatePresence>
        <div className="flex items-center gap-1.5">
          <PlayerInfo status={status} player={player} />
          <button
            onClick={onReconnect}
            title="Refresh connection"
            className="w-6 h-6 shrink-0 rounded bg-base-600 hover:bg-base-500 flex items-center justify-center text-text-muted hover:text-text-secondary transition-colors duration-150"
          >
            <Refresh />
          </button>
          <button
            onClick={() => onTabChange("settings")}
            title="Settings"
            className="w-6 h-6 shrink-0 rounded bg-base-600 hover:bg-base-500 flex items-center justify-center text-text-muted hover:text-text-secondary transition-colors duration-150"
          >
            <Settings />
          </button>
        </div>
      </div>
    </div>
  );
}
