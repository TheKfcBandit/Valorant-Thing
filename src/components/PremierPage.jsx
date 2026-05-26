import { useState, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";
import { noAnim, T0 } from "../utils/animation";
import { useAsyncEffect } from "../hooks/useAsyncEffect";
import { rankIcon, rankName } from "../utils/rank";

// Pull a field from an object using a list of possible key spellings. The
// Premier endpoints have shifted casing across Riot revisions (`id` vs `ID`,
// `members` vs `Members`, etc.), so the page reads through this helper rather
// than committing to one spelling.
function pick(obj, ...keys) {
  if (!obj || typeof obj !== "object") return undefined;
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

function normalizeMember(m) {
  return {
    puuid: pick(m, "puuid", "PUUID", "subject", "Subject") || "",
    name: pick(m, "name", "Name", "gameName", "GameName") || "",
    tag: pick(m, "tag", "Tag", "tagLine", "TagLine") || "",
  };
}

function normalizeTeam(team) {
  if (!team) return null;
  const placement = pick(team, "placement", "Placement") || {};
  const stats = pick(team, "stats", "Stats") || {};
  const customization = pick(team, "customization", "Customization") || {};
  const members = pick(team, "members", "Members") || [];
  return {
    id: pick(team, "id", "ID") || "",
    name: pick(team, "name", "Name") || "",
    tag: pick(team, "tag", "Tag") || "",
    enrolled: pick(team, "enrolled", "Enrolled") !== false,
    points: Number(pick(placement, "points", "Points") || 0),
    conferenceId: pick(placement, "conference", "Conference", "conferenceId", "ConferenceID") || "",
    divisionId: pick(placement, "division", "Division", "divisionId", "DivisionID") || "",
    place: Number(pick(placement, "place", "Place") || 0),
    wins: Number(pick(stats, "wins", "Wins") || 0),
    losses: Number(pick(stats, "losses", "Losses") || 0),
    matches: Number(pick(stats, "matches", "Matches") || 0),
    icon: pick(customization, "icon", "Icon") || "",
    image: pick(customization, "image", "Image") || "",
    primary: pick(customization, "primary", "Primary") || "",
    members: Array.isArray(members) ? members.map(normalizeMember) : [],
  };
}

function normalizeStandings(divisionJson) {
  if (!divisionJson) return [];
  const rows = pick(divisionJson, "standings", "Standings", "teams", "Teams", "Placements") || [];
  if (!Array.isArray(rows)) return [];
  return rows.map((r, idx) => ({
    id: pick(r, "id", "ID", "teamId", "TeamID") || `row-${idx}`,
    name: pick(r, "name", "Name", "teamName", "TeamName") || "",
    tag: pick(r, "tag", "Tag") || "",
    place: Number(pick(r, "place", "Place", "rank", "Rank") || idx + 1),
    points: Number(pick(r, "points", "Points") || 0),
    wins: Number(pick(r, "wins", "Wins") || 0),
    losses: Number(pick(r, "losses", "Losses") || 0),
  }));
}

function normalizeMatches(conferenceJson) {
  if (!conferenceJson) return [];
  const rows =
    pick(conferenceJson, "matches", "Matches", "schedule", "Schedule", "events", "Events") || [];
  if (!Array.isArray(rows)) return [];
  return rows
    .map((m, idx) => {
      const startRaw = pick(
        m,
        "startTime",
        "StartTime",
        "scheduledTime",
        "ScheduledTime",
        "start",
        "Start"
      );
      const startMs = startRaw ? new Date(startRaw).getTime() : 0;
      return {
        id: pick(m, "id", "ID", "matchId", "MatchID") || `m-${idx}`,
        startMs: Number.isFinite(startMs) ? startMs : 0,
        map: pick(m, "map", "Map", "mapId", "MapID") || "",
        status: pick(m, "status", "Status", "state", "State") || "",
        opponent: pick(m, "opponent", "Opponent", "opponentName", "OpponentName") || "",
        score: pick(m, "score", "Score") || "",
      };
    })
    .sort((a, b) => a.startMs - b.startMs);
}

function fmtMatchDate(ms) {
  if (!ms) return "TBD";
  const d = new Date(ms);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function PremierPage({ connected, player, playerIsStale }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [team, setTeam] = useState(null);
  const [standings, setStandings] = useState([]);
  const [matches, setMatches] = useState([]);
  const [memberMmr, setMemberMmr] = useState({});
  const [fromCache, setFromCache] = useState(false);
  const [cacheTs, setCacheTs] = useState(0);

  const hydrateFromBundle = useCallback((playerRaw, divisionRaw, conferenceRaw) => {
    try {
      const envelope = playerRaw ? JSON.parse(playerRaw) : null;
      if (!envelope || envelope.enrolled === false) {
        setTeam(null);
      } else {
        setTeam(normalizeTeam(envelope.team));
      }
    } catch {
      setTeam(null);
    }
    try {
      setStandings(divisionRaw ? normalizeStandings(JSON.parse(divisionRaw)) : []);
    } catch {
      setStandings([]);
    }
    try {
      setMatches(conferenceRaw ? normalizeMatches(JSON.parse(conferenceRaw)) : []);
    } catch {
      setMatches([]);
    }
  }, []);

  const fetchLive = useCallback(async () => {
    if (!connected || !player?.puuid) return;
    setLoading(true);
    setError(null);
    try {
      const playerRaw = await invoke("get_premier_player", { targetPuuid: player.puuid });
      const envelope = JSON.parse(playerRaw);
      if (!envelope || envelope.enrolled === false) {
        setTeam(null);
        setStandings([]);
        setMatches([]);
        setFromCache(false);
        setCacheTs(0);
        return;
      }
      const t = normalizeTeam(envelope.team);
      setTeam(t);
      let divisionRaw = "";
      let conferenceRaw = "";
      const [divisionRes, conferenceRes] = await Promise.allSettled([
        t.divisionId
          ? invoke("get_premier_division", { divisionId: t.divisionId })
          : Promise.resolve(""),
        t.conferenceId
          ? invoke("get_premier_conference", { conferenceId: t.conferenceId })
          : Promise.resolve(""),
      ]);
      if (divisionRes.status === "fulfilled") {
        divisionRaw = divisionRes.value || "";
        setStandings(divisionRaw ? normalizeStandings(JSON.parse(divisionRaw)) : []);
      }
      if (conferenceRes.status === "fulfilled") {
        conferenceRaw = conferenceRes.value || "";
        setMatches(conferenceRaw ? normalizeMatches(JSON.parse(conferenceRaw)) : []);
      }
      setFromCache(false);
      setCacheTs(0);
      // Only persist when the full bundle landed cleanly — a partial write
      // would atomically clobber a previously-valid snapshot, leaving the
      // next cold load with a fresh timestamp but blank standings/schedule.
      const bundleComplete =
        divisionRes.status === "fulfilled" && conferenceRes.status === "fulfilled";
      if (bundleComplete) {
        try {
          await invoke("cache_premier_bundle", {
            player: playerRaw,
            division: divisionRaw,
            conference: conferenceRaw,
          });
        } catch {
          /* non-fatal */
        }
      }
    } catch (e) {
      setError(typeof e === "string" ? e : e?.message || "Failed to load Premier data");
    } finally {
      setLoading(false);
    }
  }, [connected, player?.puuid]);

  // First mount: try the cache so the page paints instantly when Valorant
  // isn't running yet. Then fire the live fetch (which will overwrite both
  // the UI and the cache on success).
  useAsyncEffect(
    async (isCancelled) => {
      try {
        const snap = await invoke("get_cached_premier");
        if (!isCancelled() && snap) {
          hydrateFromBundle(snap.player, snap.division, snap.conference);
          setFromCache(true);
          setCacheTs(snap.saved_at_ms || 0);
        }
      } catch (e) {
        /* no cache yet — fine */
        console.warn("[Premier] cache load failed:", e);
      }
      if (connected) {
        await fetchLive();
      } else if (!isCancelled()) {
        setLoading(false);
      }
    },
    [connected, fetchLive, hydrateFromBundle]
  );

  // Per-member MMR — fired in parallel, tolerant of individual failures so one
  // bad lookup doesn't blank the whole roster.
  useAsyncEffect(
    async (isCancelled) => {
      if (!connected || !team?.members?.length) return;
      const results = await Promise.allSettled(
        team.members.map((m) => invoke("get_player_mmr", { targetPuuid: m.puuid }))
      );
      if (isCancelled()) return;
      const next = {};
      results.forEach((r, idx) => {
        if (r.status !== "fulfilled") return;
        try {
          const parsed = JSON.parse(r.value);
          next[team.members[idx].puuid] = {
            tier: parsed.currenttier ?? 0,
            rr: parsed.ranking_in_tier ?? 0,
          };
        } catch (e) {
          console.warn("[Premier] bad MMR payload:", e);
        }
      });
      setMemberMmr(next);
    },
    [connected, team?.id, team?.members?.length]
  );

  const myPlacement = useMemo(() => {
    if (!team) return null;
    if (team.place) return team.place;
    const idx = standings.findIndex((s) => s.id === team.id);
    return idx >= 0 ? idx + 1 : null;
  }, [team, standings]);

  const upcoming = matches.filter((m) => m.startMs >= Date.now());
  const recent = matches
    .filter((m) => m.startMs < Date.now())
    .slice(-5)
    .reverse();

  // Not connected and nothing cached → guide the user.
  if (!connected && !team && !fromCache) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={noAnim() ? T0 : { duration: 0.2 }}
        className="flex-1 flex items-center justify-center p-5"
      >
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-xl font-display font-bold text-text-primary">Premier</h1>
          <p className="text-sm font-body text-text-muted">
            Connect to Valorant to load your Premier team.
          </p>
        </div>
      </motion.div>
    );
  }

  if (loading && !team) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={noAnim() ? T0 : { duration: 0.15 }}
        className="flex-1 flex items-center justify-center p-5"
      >
        <p className="text-sm font-body text-text-muted">Loading Premier data…</p>
      </motion.div>
    );
  }

  if (error && !team) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={noAnim() ? T0 : { duration: 0.2 }}
        className="flex-1 flex items-center justify-center p-5"
      >
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-xl font-display font-bold text-text-primary">Premier</h1>
          <p className="text-sm font-body text-val-red">{error}</p>
        </div>
      </motion.div>
    );
  }

  // Connected, fetch succeeded, but the user isn't on a Premier team.
  if (!team) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={noAnim() ? T0 : { duration: 0.2 }}
        className="flex-1 flex items-center justify-center p-5"
      >
        <div className="max-w-md text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-val-red/10 border border-val-red/20 flex items-center justify-center">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-val-red"
            >
              <polygon points="12 2 15 8.5 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 9 8.5 12 2" />
            </svg>
          </div>
          <h1 className="text-xl font-display font-bold text-text-primary">
            Not on a Premier team
          </h1>
          <p className="text-sm font-body text-text-muted">
            Join or create a Premier team in Valorant — it'll show up here once you're enrolled.
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={noAnim() ? T0 : { duration: 0.2 }}
      className="flex-1 overflow-y-auto p-5 space-y-5"
    >
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {team.icon && (
            <img src={team.icon} alt="" className="w-12 h-12 rounded-lg object-cover bg-base-700" />
          )}
          <div>
            <h1 className="text-2xl font-display font-bold text-text-primary leading-tight">
              {team.name || "Premier Team"}
              {team.tag && (
                <span className="text-text-muted text-base ml-2 font-body">#{team.tag}</span>
              )}
            </h1>
            <p className="text-xs font-body text-text-muted mt-0.5">
              {team.wins}W / {team.losses}L · {team.points} pts
              {myPlacement ? ` · #${myPlacement} in division` : ""}
            </p>
          </div>
        </div>
        {(fromCache || playerIsStale) && (
          <span className="text-[10px] font-display uppercase tracking-wider px-2 py-1 rounded bg-base-700 border border-border text-text-muted shrink-0">
            Cached{cacheTs ? ` · ${new Date(cacheTs).toLocaleDateString()}` : ""}
          </span>
        )}
      </header>

      <section>
        <h2 className="text-[10px] font-display font-bold text-text-muted uppercase tracking-wider mb-2">
          Roster
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {team.members.map((m) => {
            const mm = memberMmr[m.puuid];
            const tier = mm?.tier ?? 0;
            return (
              <div
                key={m.puuid || `${m.name}#${m.tag}`}
                className="flex items-center gap-2.5 rounded-lg border border-border bg-base-700/60 px-3 py-2"
              >
                <img src={rankIcon(tier)} alt="" className="w-9 h-9 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-body text-text-primary truncate">
                    {m.name || "Unknown"}
                    {m.tag && <span className="text-text-muted ml-1">#{m.tag}</span>}
                  </p>
                  <p className="text-xs font-body text-text-muted">
                    {rankName(tier)}
                    {mm?.rr ? ` · ${mm.rr} RR` : ""}
                  </p>
                </div>
              </div>
            );
          })}
          {!team.members.length && (
            <p className="col-span-2 text-xs font-body text-text-muted italic">
              No roster members returned.
            </p>
          )}
        </div>
      </section>

      {standings.length > 0 && (
        <section>
          <h2 className="text-[10px] font-display font-bold text-text-muted uppercase tracking-wider mb-2">
            Division standings
          </h2>
          <div className="rounded-lg border border-border bg-base-700/60 overflow-hidden">
            {standings.map((row) => {
              const isMe = row.id === team.id;
              return (
                <div
                  key={row.id}
                  className={`flex items-center gap-3 px-3 py-2 text-sm font-body border-b border-border last:border-b-0 ${isMe ? "bg-val-red/10 text-text-primary" : "text-text-secondary"}`}
                >
                  <span className="w-6 text-right tabular-nums text-text-muted">{row.place}</span>
                  <span className="flex-1 truncate">
                    {row.name || "—"}
                    {row.tag && <span className="text-text-muted ml-1">#{row.tag}</span>}
                  </span>
                  <span className="text-xs text-text-muted tabular-nums">
                    {row.wins}W / {row.losses}L
                  </span>
                  <span className="w-12 text-right tabular-nums">{row.points}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {(upcoming.length > 0 || recent.length > 0) && (
        <section>
          <h2 className="text-[10px] font-display font-bold text-text-muted uppercase tracking-wider mb-2">
            Schedule
          </h2>
          <div className="rounded-lg border border-border bg-base-700/60 overflow-hidden">
            {upcoming.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-3 px-3 py-2 text-sm font-body border-b border-border last:border-b-0"
              >
                <span className="text-xs font-display text-accent-blue uppercase tracking-wider w-16">
                  Upcoming
                </span>
                <span className="flex-1 text-text-secondary truncate">
                  {m.map || m.opponent || "Match"}
                </span>
                <span className="text-xs text-text-muted tabular-nums">
                  {fmtMatchDate(m.startMs)}
                </span>
              </div>
            ))}
            {recent.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-3 px-3 py-2 text-sm font-body border-b border-border last:border-b-0"
              >
                <span className="text-xs font-display text-text-muted uppercase tracking-wider w-16">
                  Past
                </span>
                <span className="flex-1 text-text-secondary truncate">
                  {m.map || m.opponent || "Match"}
                </span>
                <span className="text-xs text-text-muted tabular-nums">
                  {m.score ? `${m.score} · ` : ""}
                  {fmtMatchDate(m.startMs)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </motion.div>
  );
}
