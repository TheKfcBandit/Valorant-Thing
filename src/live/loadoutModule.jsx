import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCached, setCache } from "../matchCache";
import { getLevelLookup, getAccessoryLookup } from "../valApiSkins";

const SOCKET_SKIN_LEVEL = "bcef87d6-209b-46c6-8b19-fbe40bd95abc";
const SOCKET_BUDDY_LEVEL = "dd3bf334-87f3-40bd-b043-682a57a8dc3a";

const MARQUEE_WEAPONS = [
  { uuid: "9c82e19d-4575-0200-1a81-3eacf00cf872", label: "Vandal" },
  { uuid: "ee8e8d15-496b-07ac-e5f6-8fae5d4c7b1a", label: "Phantom" },
  { uuid: "a03b24d3-4319-996d-0f8c-94bbfba1dfc7", label: "Operator" },
  { uuid: "2f59173c-4bed-b6c3-2191-dea9b58be9c7", label: "Melee" },
];

const ALL_WEAPONS = [
  { uuid: "29a0cfab-485b-f5d5-779a-b59f85e204a8", label: "Classic" },
  { uuid: "42da8ccc-40d5-affc-beec-15aa47b42eda", label: "Shorty" },
  { uuid: "44d4e95c-4157-0037-81b2-17841bf2e8e3", label: "Frenzy" },
  { uuid: "1baa85b4-4c70-1284-64bb-6481dfc3bb4e", label: "Ghost" },
  { uuid: "e336c6b8-418d-9340-d77f-7a9e4cfe0702", label: "Sheriff" },
  { uuid: "f7e1b454-4ad4-1063-ec0a-159e56b58941", label: "Stinger" },
  { uuid: "462080d1-4035-2937-7c09-27aa2a5e27a7", label: "Spectre" },
  { uuid: "910be174-449b-c412-ab22-d0873436b21b", label: "Bucky" },
  { uuid: "ec845bf4-4f79-ddda-a3da-0db3774b2794", label: "Judge" },
  { uuid: "ae3de142-4d85-2547-dd26-4e90bed35cf7", label: "Bulldog" },
  { uuid: "4ade7faa-4cf1-8376-95ef-39884480959b", label: "Guardian" },
  { uuid: "ee8e8d15-496b-07ac-e5f6-8fae5d4c7b1a", label: "Phantom" },
  { uuid: "9c82e19d-4575-0200-1a81-3eacf00cf872", label: "Vandal" },
  { uuid: "c4883e50-4494-202c-3ec3-6b8a9284f00b", label: "Marshal" },
  { uuid: "a03b24d3-4319-996d-0f8c-94bbfba1dfc7", label: "Operator" },
  { uuid: "55d8a0f4-4274-ca67-fe2c-06ab45efdf58", label: "Ares" },
  { uuid: "63e6c2b6-4a8e-869c-3d4c-e38355226584", label: "Odin" },
  { uuid: "2f59173c-4bed-b6c3-2191-dea9b58be9c7", label: "Melee" },
];

function socketItemId(loadout, weaponUuid, socketUuid) {
  const item = loadout?.Items?.[weaponUuid] || loadout?.Items?.[weaponUuid?.toUpperCase()];
  if (!item) return null;
  const sockets = item.Sockets || {};
  for (const k of Object.keys(sockets)) {
    if (k.toLowerCase() === socketUuid) {
      const id = sockets[k]?.Item?.ID;
      return id ? id.toLowerCase() : null;
    }
  }
  return null;
}

const getEquippedSkinLevelUuid = (loadout, weaponUuid) => socketItemId(loadout, weaponUuid, SOCKET_SKIN_LEVEL);
const getEquippedBuddyUuid = (loadout, weaponUuid) => socketItemId(loadout, weaponUuid, SOCKET_BUDDY_LEVEL);

// Singleton-backed hooks — getLevelLookup/getAccessoryLookup memoize the
// underlying fetch, so calling them from every card is cheap.
function useSkinLookup() {
  const [v, setV] = useState(null);
  useEffect(() => { let alive = true; getLevelLookup().then((r) => { if (alive) setV(r); }).catch(() => {}); return () => { alive = false; }; }, []);
  return v || {};
}

function useAccessoryLookup() {
  const [v, setV] = useState(null);
  useEffect(() => { let alive = true; getAccessoryLookup().then((r) => { if (alive) setV(r); }).catch(() => {}); return () => { alive = false; }; }, []);
  return v || {};
}

// The Riot loadouts endpoint differs between phases:
//   coregame: each Loadouts[i].Loadout.Subject identifies the player.
//   pregame:  entries may have no Subject — they're positional, in the same
//             order as AllyTeam.Players.
// So we collect explicit subjects first, then fall back to positional
// matching against allies for any entries without a Subject.
async function fetchLoadouts({ matchId, phase, players, addLog }) {
  if (!matchId) return {};
  const phaseArg = phase === "PREGAME" ? "pregame" : "ingame";
  const raw = await invoke("get_match_loadouts", { matchId, phase: phaseArg });
  const data = JSON.parse(raw);
  const entries = data?.Loadouts || [];

  const byPuuid = {};
  const orderedNoSubject = [];
  for (const entry of entries) {
    const inner = entry?.Loadout || entry;
    const subject = (inner?.Subject || entry?.Subject || "").toLowerCase();
    if (subject) {
      byPuuid[subject] = inner;
    } else {
      orderedNoSubject.push(inner);
    }
  }

  if (orderedNoSubject.length > 0) {
    let posIdx = 0;
    for (const p of players) {
      if (p.team !== "ally") continue;
      const puuid = (p.puuid || "").toLowerCase();
      if (byPuuid[puuid]) continue;
      if (posIdx >= orderedNoSubject.length) break;
      byPuuid[puuid] = orderedNoSubject[posIdx++];
    }
  }

  for (const [puuid, lo] of Object.entries(byPuuid)) {
    setCache(puuid, "loadout", lo);
  }

  addLog?.("info", `[Live] Loadouts ${phaseArg}: ${Object.keys(byPuuid).length} player(s)`);
  return byPuuid;
}

function CardSlot({ player, data: loadout }) {
  const skinLookup = useSkinLookup();
  if (!loadout) return null;
  return (
    <div className="flex items-center gap-1 mt-1">
      {MARQUEE_WEAPONS.map((w) => {
        const lvlId = getEquippedSkinLevelUuid(loadout, w.uuid);
        const meta = lvlId ? skinLookup[lvlId] : null;
        return (
          <div
            key={w.uuid}
            className="h-4 w-10 rounded-sm bg-base-600/60 flex items-center justify-center overflow-hidden border border-border/40"
            title={meta ? `${w.label}: ${meta.name}` : `${w.label}: default`}
          >
            {meta?.icon ? (
              <img src={meta.icon} alt="" className="w-full h-full object-contain" loading="lazy" />
            ) : (
              <span className="text-[7px] font-body text-text-muted/60">{w.label[0]}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DialogSection({ player, data: loadout }) {
  const skinLookup = useSkinLookup();
  const accessoryLookup = useAccessoryLookup();
  if (!loadout) return null;
  const identity = loadout.Identity || {};
  const cardMeta = identity.PlayerCardID ? accessoryLookup[identity.PlayerCardID.toLowerCase()] : null;
  const titleMeta = identity.PlayerTitleID ? accessoryLookup[identity.PlayerTitleID.toLowerCase()] : null;
  const sprays = Array.isArray(loadout.Sprays) ? loadout.Sprays : [];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xs font-display font-medium text-text-secondary uppercase tracking-wider mb-2">Weapons</h3>
        <div className="grid grid-cols-3 gap-2">
          {ALL_WEAPONS.map((w) => {
            const lvlId = getEquippedSkinLevelUuid(loadout, w.uuid);
            const meta = lvlId ? skinLookup[lvlId] : null;
            const buddyId = getEquippedBuddyUuid(loadout, w.uuid);
            const buddyMeta = buddyId ? accessoryLookup[buddyId] : null;
            return (
              <div key={w.uuid} className="p-2 rounded-lg bg-base-700 border border-border flex flex-col gap-1.5">
                <div className="h-10 flex items-center justify-center bg-base-600/40 rounded">
                  {meta?.icon ? (
                    <img src={meta.icon} alt="" className="max-h-9 max-w-full object-contain" loading="lazy" />
                  ) : (
                    <span className="text-[10px] font-body text-text-muted/60">default</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-display font-semibold text-text-muted uppercase tracking-wide">{w.label}</p>
                  <p className="text-[11px] font-body text-text-primary truncate" title={meta?.name || "Default"}>
                    {meta?.name || "Default"}
                  </p>
                </div>
                {buddyMeta?.image && (
                  <div className="flex items-center gap-1.5 pt-1 border-t border-border/40">
                    <img src={buddyMeta.image} alt="" className="w-4 h-4 object-contain" loading="lazy" />
                    <span className="text-[9px] font-body text-text-muted truncate" title={buddyMeta.name}>{buddyMeta.name}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {sprays.length > 0 && (
        <div>
          <h3 className="text-xs font-display font-medium text-text-secondary uppercase tracking-wider mb-2">Sprays</h3>
          <div className="flex gap-2">
            {sprays.map((s, i) => {
              const sprayId = (s?.SprayID || s?.LevelID || "").toLowerCase();
              const meta = sprayId ? accessoryLookup[sprayId] : null;
              return (
                <div key={i} className="flex-1 p-2 rounded-lg bg-base-700 border border-border flex flex-col items-center gap-1">
                  <div className="w-12 h-12 flex items-center justify-center bg-base-600/40 rounded">
                    {meta?.image ? (
                      <img src={meta.image} alt="" className="max-h-11 max-w-full object-contain" loading="lazy" />
                    ) : (
                      <span className="text-[10px] font-body text-text-muted/60">—</span>
                    )}
                  </div>
                  <span className="text-[10px] font-body text-text-muted truncate w-full text-center" title={meta?.name}>
                    {meta?.name || "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(cardMeta?.image || titleMeta?.name) && (
        <div>
          <h3 className="text-xs font-display font-medium text-text-secondary uppercase tracking-wider mb-2">Identity</h3>
          <div className="flex items-center gap-3 p-2 rounded-lg bg-base-700 border border-border">
            {cardMeta?.image && (
              <img src={cardMeta.image} alt="" className="w-12 h-12 rounded object-cover" loading="lazy" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-body text-text-primary truncate">{cardMeta?.name || "—"}</p>
              {titleMeta?.name && (
                <p className="text-[10px] font-body text-text-muted italic truncate">{titleMeta.name}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const loadoutModule = {
  id: "loadout",
  label: "Loadout",
  fetch: fetchLoadouts,
  CardSlot,
  DialogSection,
  cachedFor: (puuid) => getCached(puuid, "loadout"),
};
