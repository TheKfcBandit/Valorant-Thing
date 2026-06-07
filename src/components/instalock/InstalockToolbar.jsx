import { Globe, MapFold, Search } from "../../icons";
import { ROLES, ROLE_ICONS } from "../../utils/agents";
import ProfileManager from "./ProfileManager";

// Top bar for the instalock page: sub-tab pill (All Maps / Per Map),
// the profile dropdown, search input, active toggle. Plus the role
// filter row that hangs below it.
//
// Receives state + handlers as a flat prop bag from the page; this
// component is purely presentational.
export default function InstalockToolbar({
  connected,
  active,
  setActive,
  onActiveChange,
  subTab,
  setSubTab,
  setSelectedMap,
  search,
  setSearch,
  selectedMap,
  roleFilter,
  setRoleFilter,
  profileManagerProps,
}) {
  return (
    <>
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex bg-base-700 rounded-lg p-0.5 border border-border">
          <button
            onClick={() => {
              setSubTab("all");
              setSelectedMap(null);
              setSearch("");
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-display font-medium tracking-wide transition-colors duration-150 ${
              subTab === "all"
                ? "bg-base-500 text-text-primary"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            <Globe />
            All Maps
          </button>
          <button
            onClick={() => {
              setSubTab("permap");
              setSearch("");
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-display font-medium tracking-wide transition-colors duration-150 ${
              subTab === "permap"
                ? "bg-base-500 text-text-primary"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            <MapFold />
            Per Map
          </button>
        </div>

        <ProfileManager {...profileManagerProps} />

        <div className="flex-1" />

        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted">
            <Search />
          </span>
          <input
            type="text"
            placeholder={
              subTab === "permap" && !selectedMap ? "Search maps..." : "Search agents..."
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-44 pl-8 pr-3 py-1.5 bg-base-700 border border-border rounded-lg text-xs font-body text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-light transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 ml-1">
          <span
            className={`text-xs font-display tracking-wide ${!connected ? "text-text-muted" : active ? "text-status-green" : "text-text-muted"}`}
          >
            {!connected ? "Off" : active ? "Active" : "Inactive"}
          </span>
          <button
            disabled={!connected}
            onClick={() => {
              if (!connected) return;
              const next = !active;
              setActive(next);
              onActiveChange?.(next);
            }}
            className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${
              !connected
                ? "bg-base-500 opacity-50 cursor-not-allowed"
                : active
                  ? "bg-status-green"
                  : "bg-base-500"
            }`}
          >
            <div
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
                !connected ? "translate-x-0.5" : active ? "translate-x-[18px]" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      </div>

      {(subTab === "all" || selectedMap) && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setRoleFilter("all")}
            className={`px-2.5 py-1 text-[10px] font-display font-medium rounded-md transition-colors ${
              roleFilter === "all"
                ? "bg-val-red/20 text-val-red border border-val-red/40"
                : "text-text-muted hover:text-text-secondary border border-transparent"
            }`}
          >
            ALL
          </button>
          {ROLES.map((role) => (
            <button
              key={role}
              onClick={() => setRoleFilter(roleFilter === role ? "all" : role)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors ${
                roleFilter === role
                  ? "bg-val-red/20 text-val-red border border-val-red/40"
                  : "text-text-muted hover:text-text-secondary border border-transparent"
              }`}
            >
              <img
                src={ROLE_ICONS[role]}
                alt=""
                className={`w-3 h-3 ${roleFilter === role ? "brightness-125" : "opacity-50"}`}
              />
              <span className="text-[10px] font-display font-medium">{role}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
