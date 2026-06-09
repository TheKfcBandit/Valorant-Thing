import { useState, useEffect, useRef } from "react";
import { MODE_NAMES, normalizeModeKey } from "../../utils/gameMode";
import { MAP_CODENAMES } from "../../utils/maps";
import { SERVER_NAMES } from "../../utils/gamePod";
import { Check, ChevronDown, Globe } from "../../icons";

// Display ordering for the custom-game mode dropdown — most-played first.
const MODE_PRIORITY = [
  "Swiftplay",
  "Standard",
  "Deathmatch",
  "Spike Rush",
  "Escalation",
  "Replication",
  "Team Deathmatch",
];

export function CustomGameSetup({
  party,
  customConfigs,
  savingCustom,
  apiMaps,
  apiModes,
  onChangeSetting,
}) {
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [showModePicker, setShowModePicker] = useState(false);
  const [showServerPicker, setShowServerPicker] = useState(false);
  const mapPickerRef = useRef(null);
  const modePickerRef = useRef(null);
  const serverPickerRef = useRef(null);

  useEffect(() => {
    if (!showMapPicker) return;
    const h = (e) => {
      if (mapPickerRef.current && !mapPickerRef.current.contains(e.target)) setShowMapPicker(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showMapPicker]);

  useEffect(() => {
    if (!showModePicker) return;
    const h = (e) => {
      if (modePickerRef.current && !modePickerRef.current.contains(e.target))
        setShowModePicker(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showModePicker]);

  useEffect(() => {
    if (!showServerPicker) return;
    const h = (e) => {
      if (serverPickerRef.current && !serverPickerRef.current.contains(e.target))
        setShowServerPicker(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showServerPicker]);

  const getModeName = (m) => {
    const f = normalizeModeKey(m);
    if (MODE_NAMES[f]) return MODE_NAMES[f];
    if (f.includes("hurm")) return "Team Deathmatch";
    return f
      .replace(/_gamemode|gamemode/gi, "")
      .replace(/_/g, " ")
      .trim();
  };
  const getModeIcon = (m) => {
    const cls = (m.split("/").pop()?.split(".")[0] || "").toLowerCase();
    return apiModes?.[cls]?.displayIcon || null;
  };
  const getModeBg = (m) => {
    const cls = (m.split("/").pop()?.split(".")[0] || "").toLowerCase();
    return apiModes?.[cls]?.listViewIconTall || null;
  };
  const getMapName = (m) => {
    const raw = m.split("/").pop() || m;
    return apiMaps?.[m.toLowerCase()]?.displayName || MAP_CODENAMES[raw] || raw;
  };
  const getMapImg = (m) => apiMaps?.[m.toLowerCase()]?.listViewIcon || null;
  const getMapSplash = (m) => apiMaps?.[m.toLowerCase()]?.splash || null;

  const curMode = party.custom_mode || "";
  const isHURM = curMode.includes("HURM");
  const isSkirmish = curMode.includes("Skirmish");
  const filteredMaps = customConfigs.maps.filter((m) => {
    if (isSkirmish) return m.includes("Duel") || m.includes("Skirmish");
    if (isHURM) return m.includes("HURM");
    return !m.includes("HURM") && !m.includes("Duel") && !m.includes("Skirmish");
  });
  const seen = new Set();
  const sortedModes = [...customConfigs.modes]
    .sort((a, b) => {
      const ai = MODE_PRIORITY.indexOf(getModeName(a));
      const bi = MODE_PRIORITY.indexOf(getModeName(b));
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    })
    .filter((m) => {
      const n = getModeName(m);
      if (seen.has(n)) return false;
      seen.add(n);
      return true;
    });

  const curMapSplash = getMapSplash(party.custom_map);

  return (
    <div className="rounded-lg bg-base-700 border border-border overflow-hidden">
      {curMapSplash && (
        <div className="relative h-20 overflow-hidden">
          <img src={curMapSplash} alt="" className="w-full h-full object-cover opacity-40" />
          <div className="absolute inset-0 bg-gradient-to-t from-base-700 via-base-700/60 to-transparent" />
          <div className="absolute bottom-2 left-3 flex items-center gap-2">
            {getModeIcon(curMode) && (
              <img
                src={getModeIcon(curMode)}
                alt=""
                className="w-5 h-5 brightness-0 invert opacity-60"
              />
            )}
            <span className="text-[13px] font-display font-bold text-white drop-shadow">
              {getMapName(party.custom_map)}
            </span>
            <span className="text-[10px] font-body text-white/50">— {getModeName(curMode)}</span>
          </div>
          {savingCustom && (
            <div className="absolute top-2 right-3">
              <span className="text-[10px] text-white/60 animate-pulse">Saving...</span>
            </div>
          )}
        </div>
      )}
      <div className="p-3 space-y-2.5">
        {!curMapSplash && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-display font-semibold text-text-primary">
              Custom Game Settings
            </span>
            {savingCustom && (
              <span className="text-[10px] text-text-muted animate-pulse">Saving...</span>
            )}
          </div>
        )}

        <div className="relative" ref={modePickerRef}>
          <label className="text-[10px] font-body text-text-muted mb-0.5 block">Mode</label>
          <button
            onClick={() => {
              setShowModePicker((v) => !v);
              setShowMapPicker(false);
            }}
            disabled={savingCustom}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 bg-base-600 border border-border rounded-lg text-[11px] font-body text-text-primary hover:border-val-red/40 transition-colors disabled:opacity-50 relative overflow-hidden"
          >
            {getModeBg(curMode) && (
              <img
                src={getModeBg(curMode)}
                alt=""
                className="absolute inset-0 w-full h-full object-cover opacity-[0.08]"
              />
            )}
            <span className="relative flex items-center gap-2 flex-1">
              {getModeIcon(curMode) && (
                <img
                  src={getModeIcon(curMode)}
                  alt=""
                  className="w-4 h-4 brightness-0 invert opacity-70"
                />
              )}
              {getModeName(curMode)}
            </span>
            <ChevronDown
              className={`text-text-muted transition-transform shrink-0 relative ${showModePicker ? "rotate-180" : ""}`}
            />
          </button>
          {showModePicker && (
            <div className="absolute z-50 mt-1 left-0 right-0 bg-base-800 border border-border rounded-lg shadow-xl max-h-64 overflow-y-auto">
              {sortedModes.map((m) => {
                const active = m === curMode;
                return (
                  <button
                    key={m}
                    onClick={() => {
                      onChangeSetting({ mode: m });
                      setShowModePicker(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-[11px] font-body hover:bg-base-600 transition-colors relative overflow-hidden ${active ? "bg-base-600 text-text-primary" : "text-text-secondary"}`}
                  >
                    {getModeBg(m) && (
                      <img
                        src={getModeBg(m)}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover opacity-[0.06]"
                      />
                    )}
                    {getModeIcon(m) && (
                      <img
                        src={getModeIcon(m)}
                        alt=""
                        className="w-4 h-4 brightness-0 invert opacity-60 relative"
                      />
                    )}
                    <span className="relative">{getModeName(m)}</span>
                    {active && (
                      <div className="ml-auto w-1.5 h-1.5 rounded-full bg-val-red relative" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="relative" ref={mapPickerRef}>
          <label className="text-[10px] font-body text-text-muted mb-0.5 block">Map</label>
          <button
            onClick={() => {
              setShowMapPicker((v) => !v);
              setShowModePicker(false);
            }}
            disabled={savingCustom}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 bg-base-600 border border-border rounded-lg text-[11px] font-body text-text-primary hover:border-val-red/40 transition-colors disabled:opacity-50 overflow-hidden relative"
          >
            {getMapImg(party.custom_map) && (
              <img
                src={getMapImg(party.custom_map)}
                alt=""
                className="w-8 h-5 object-cover rounded shrink-0"
              />
            )}
            <span className="flex-1 text-left">{getMapName(party.custom_map)}</span>
            <ChevronDown
              className={`text-text-muted transition-transform shrink-0 ${showMapPicker ? "rotate-180" : ""}`}
            />
          </button>
          {showMapPicker && (
            <div className="absolute z-50 mt-1 left-0 right-0 bg-base-800 border border-border rounded-lg shadow-xl max-h-64 overflow-y-auto">
              {filteredMaps.map((m) => {
                const active = m === party.custom_map;
                const img = getMapImg(m);
                return (
                  <button
                    key={m}
                    onClick={() => {
                      onChangeSetting({ map: m });
                      setShowMapPicker(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 text-[11px] font-body hover:bg-base-600 transition-colors ${active ? "bg-base-600 text-text-primary" : "text-text-secondary"}`}
                  >
                    {img ? (
                      <img src={img} alt="" className="w-8 h-5 object-cover rounded shrink-0" />
                    ) : (
                      <div className="w-8 h-5 bg-base-600 rounded shrink-0" />
                    )}
                    <span className="flex-1 text-left">{getMapName(m)}</span>
                    {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-val-red" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="relative" ref={serverPickerRef}>
          <label className="text-[10px] font-body text-text-muted mb-0.5 block">Server</label>
          <button
            onClick={() => {
              setShowServerPicker((v) => !v);
              setShowMapPicker(false);
              setShowModePicker(false);
            }}
            disabled={savingCustom}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 bg-base-600 border border-border rounded-lg text-[11px] font-body text-text-primary hover:border-val-red/40 transition-colors disabled:opacity-50"
          >
            <Globe size={12} className="text-text-muted shrink-0" />
            <span className="flex-1 text-left">
              {(() => {
                const pts = (party.custom_pod || "").toLowerCase().split(/[.-]/);
                const c = pts.find((s) => SERVER_NAMES[s]);
                return c ? SERVER_NAMES[c] : party.custom_pod || "";
              })()}
            </span>
            <ChevronDown
              className={`text-text-muted transition-transform shrink-0 ${showServerPicker ? "rotate-180" : ""}`}
            />
          </button>
          {showServerPicker && (
            <div className="absolute z-50 mt-1 left-0 right-0 bg-base-800 border border-border rounded-lg shadow-xl max-h-64 overflow-y-auto">
              {customConfigs.pods.map((p) => {
                const active = p === party.custom_pod;
                const pts = p.toLowerCase().split(/[.-]/);
                const city = pts.find((s) => SERVER_NAMES[s]);
                return (
                  <button
                    key={p}
                    onClick={() => {
                      onChangeSetting({ pod: p });
                      setShowServerPicker(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 text-[11px] font-body hover:bg-base-600 transition-colors ${active ? "bg-base-600 text-text-primary" : "text-text-secondary"}`}
                  >
                    <Globe size={12} className="text-text-muted shrink-0" />
                    <span className="flex-1 text-left">{city ? SERVER_NAMES[city] : p}</span>
                    {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-val-red" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-border pt-2 space-y-1.5">
          <span className="text-[10px] font-display font-semibold text-text-muted">Game Rules</span>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {[
              { key: "allowCheats", label: "Allow Cheats", val: party.custom_allow_cheats },
              {
                key: "tournamentMode",
                label: "Tournament Mode",
                val: party.custom_tournament_mode,
              },
              {
                key: "overtimeWinByTwo",
                label: "Overtime Win By Two",
                val: party.custom_overtime_win_by_two,
              },
              {
                key: "playOutAllRounds",
                label: "Play Out All Rounds",
                val: party.custom_play_out_all_rounds,
              },
              {
                key: "skipMatchHistory",
                label: "Skip Match History",
                val: party.custom_skip_match_history,
              },
            ].map(({ key, label, val }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer group">
                <button
                  onClick={() => onChangeSetting({ [key]: !val })}
                  disabled={savingCustom}
                  className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors disabled:opacity-50 ${val ? "bg-val-red border-val-red" : "bg-base-600 border-border group-hover:border-text-muted"}`}
                >
                  {val && <Check size={8} stroke="white" strokeWidth="3" />}
                </button>
                <span className="text-[11px] font-body text-text-primary select-none">{label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
