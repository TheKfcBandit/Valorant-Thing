import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";
import { noAnim, T0 } from "../utils/animation";
import { useAsyncEffect } from "../hooks/useAsyncEffect";
import { useApiLookup } from "../hooks/useApiLookup";
import { getAgentLookup, getMapLookup } from "../valApiSkins";
import { MODE_NAMES } from "../utils/gameMode";
import { formatError } from "../utils/authError";
import { HeatmapTab } from "../icons";

// Where am I dying the most (#37). v1 surface: pick a map, see every death
// across the local match-details cache overlaid on that map's minimap.
//
// Data source: the same cache the match-details modal populates on click
// (commit 0ce230d). v1 accepts the "open a few matches first" empty state
// — backfilling the batch results from get_match_page is a future PR.
//
// Coordinate transform: each Valorant map's `valorant-api` entry carries
// xMultiplier/xScalarToAdd/yMultiplier/yScalarToAdd, where:
//   imageX = (gameY * xMultiplier) + xScalarToAdd
//   imageY = (gameX * yMultiplier) + yScalarToAdd
// The swap is Riot's convention. Output is normalized 0-1 against the
// displayIcon image's intrinsic resolution; we multiply by the rendered
// size to position the dot.

const DOT_PX = 8;

export default function HeatmapPage({ player }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mapKey, setMapKey] = useState(null);
  const [queueFilter, setQueueFilter] = useState("all");
  const maps = useApiLookup(getMapLookup);
  const agents = useApiLookup(getAgentLookup);

  const puuid = player?.puuid;

  useAsyncEffect(
    async (isCancelled) => {
      if (!puuid) {
        setLoading(false);
        return;
      }
      try {
        const raw = await invoke("get_death_locations", { playerPuuid: puuid });
        if (isCancelled()) return;
        const list = JSON.parse(raw);
        setEvents(Array.isArray(list) ? list : []);
      } catch (e) {
        if (!isCancelled()) setError(formatError(e, "Failed to load death data"));
      } finally {
        if (!isCancelled()) setLoading(false);
      }
    },
    [puuid]
  );

  // Map URL → { name, image, multipliers, count }. Built off the events
  // themselves so the picker only lists maps we actually have data for.
  const mapOptions = useMemo(() => {
    const byKey = new Map();
    for (const e of events) {
      const key = (e.mapId || "").toLowerCase();
      if (!key) continue;
      const cur = byKey.get(key) || { mapId: e.mapId, count: 0 };
      cur.count += 1;
      byKey.set(key, cur);
    }
    const out = [];
    for (const [key, val] of byKey) {
      const meta = maps[key];
      if (!meta?.displayIcon) continue;
      out.push({
        key,
        mapId: val.mapId,
        name: meta.displayName || val.mapId,
        image: meta.displayIcon,
        xMultiplier: Number(meta.xMultiplier) || 0,
        yMultiplier: Number(meta.yMultiplier) || 0,
        xScalarToAdd: Number(meta.xScalarToAdd) || 0,
        yScalarToAdd: Number(meta.yScalarToAdd) || 0,
        count: val.count,
      });
    }
    out.sort((a, b) => b.count - a.count);
    return out;
  }, [events, maps]);

  // Default-select the map with the most deaths once data lands. Also
  // recover when the current selection is no longer present (e.g. queue
  // filter wiped its only event — rare but possible).
  useEffect(() => {
    if (mapOptions.length === 0) return;
    if (!mapKey || !mapOptions.some((m) => m.key === mapKey)) {
      setMapKey(mapOptions[0].key);
    }
  }, [mapOptions, mapKey]);

  const selectedMap = mapOptions.find((m) => m.key === mapKey) || null;

  const availableQueues = useMemo(() => {
    if (!selectedMap) return [];
    const set = new Set();
    for (const e of events) {
      if ((e.mapId || "").toLowerCase() === selectedMap.key && e.queueId) {
        set.add(e.queueId);
      }
    }
    return [...set].sort();
  }, [events, selectedMap]);

  const visibleDeaths = useMemo(() => {
    if (!selectedMap) return [];
    return events.filter((e) => {
      if ((e.mapId || "").toLowerCase() !== selectedMap.key) return false;
      if (queueFilter !== "all" && e.queueId !== queueFilter) return false;
      return true;
    });
  }, [events, selectedMap, queueFilter]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={noAnim() ? T0 : { duration: 0.2 }}
      className="flex-1 flex flex-col min-h-0 overflow-y-auto p-4 gap-3"
    >
      <header>
        <h1 className="text-2xl font-display font-bold text-text-primary">Death Heatmap</h1>
        <p className="text-xs text-text-muted">
          Where you&apos;ve been dying across every match you&apos;ve opened in details.
        </p>
      </header>

      {!puuid && (
        <EmptyState
          title="Connect first"
          body="Sign in or start the Riot Client so we know which player to filter by."
        />
      )}

      {puuid && loading && <p className="text-xs font-body text-text-muted">Loading death data…</p>}

      {error && (
        <div className="px-3 py-2 rounded-md border border-val-red/40 bg-val-red/10 text-sm text-val-red">
          {error}
        </div>
      )}

      {puuid && !loading && !error && mapOptions.length === 0 && (
        <EmptyState
          title="No death data yet"
          body="Open a match in the Home page details modal to populate the cache; then come back here. The data grows as you browse history."
        />
      )}

      {selectedMap && (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-2 text-[11px] font-display font-bold text-text-muted uppercase tracking-wider">
              Map
              <select
                value={mapKey}
                onChange={(e) => setMapKey(e.target.value)}
                className="text-[11px] font-body bg-base-700 border border-border rounded px-2 py-1 text-text-primary focus:outline-none focus:border-text-muted"
              >
                {mapOptions.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.name} ({m.count})
                  </option>
                ))}
              </select>
            </label>
            {availableQueues.length > 1 && (
              <label className="flex items-center gap-2 text-[11px] font-display font-bold text-text-muted uppercase tracking-wider">
                Queue
                <select
                  value={queueFilter}
                  onChange={(e) => setQueueFilter(e.target.value)}
                  className="text-[11px] font-body bg-base-700 border border-border rounded px-2 py-1 text-text-primary focus:outline-none focus:border-text-muted"
                >
                  <option value="all">All queues</option>
                  {availableQueues.map((q) => (
                    <option key={q} value={q}>
                      {MODE_NAMES[q] || q}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <span className="text-[11px] font-body text-text-muted">
              {visibleDeaths.length} death{visibleDeaths.length === 1 ? "" : "s"}
            </span>
          </div>

          <MapHeatmap map={selectedMap} deaths={visibleDeaths} agents={agents} />
        </>
      )}
    </motion.div>
  );
}

function MapHeatmap({ map, deaths, agents }) {
  return (
    <div className="relative w-full max-w-2xl mx-auto rounded-xl border border-border bg-base-700 overflow-hidden">
      <div className="relative">
        <img
          src={map.image}
          alt={map.name}
          className="block w-full h-auto select-none"
          draggable={false}
        />
        <div className="absolute inset-0 pointer-events-none">
          {deaths.map((d, i) => {
            // Riot's convention: image-x derives from game-y, image-y from game-x.
            const nx = d.y * map.xMultiplier + map.xScalarToAdd;
            const ny = d.x * map.yMultiplier + map.yScalarToAdd;
            // Skip points the transform pushed off-canvas (rare; usually
            // means missing multipliers for that map version).
            if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return null;
            const killerName = agents[d.killerAgent]?.displayName || "Unknown";
            return (
              <span
                key={`${d.matchId}-${d.roundNum}-${i}`}
                title={`Round ${d.roundNum + 1} · killed by ${killerName}`}
                className="absolute rounded-full bg-val-red/55 border border-val-red/70 shadow-[0_0_4px_rgba(255,70,85,0.7)]"
                style={{
                  left: `calc(${nx * 100}% - ${DOT_PX / 2}px)`,
                  top: `calc(${ny * 100}% - ${DOT_PX / 2}px)`,
                  width: DOT_PX,
                  height: DOT_PX,
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ title, body }) {
  return (
    <div className="max-w-md mx-auto text-center space-y-3 mt-12">
      <div className="w-12 h-12 mx-auto rounded-full bg-val-red/10 border border-val-red/20 flex items-center justify-center">
        <HeatmapTab size={22} className="text-val-red" />
      </div>
      <h2 className="text-lg font-display font-bold text-text-primary">{title}</h2>
      <p className="text-sm font-body text-text-muted">{body}</p>
    </div>
  );
}
