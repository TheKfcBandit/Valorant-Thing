import { invoke } from "@tauri-apps/api/core";
import { getCached, setCache } from "../matchCache";
import { getLevelLookup, getAccessoryLookup, getWeaponLookup } from "../valApiSkins";
import { useApiLookup } from "../hooks/useApiLookup";

// Well-known Riot socket UUIDs. Cross-checked against multiple community
// client implementations (RadiantConnect, valorant-rank-yoinker, etc).
// Per-weapon Sockets is keyed by these:
//   skin       → base skin UUID (we don't read it)
//   skin_level → specific equipped level UUID (resolves via getLevelLookup)
//   buddy      → equipped buddy level UUID (resolves via getAccessoryLookup)
const SOCKET_SKIN_LEVEL = "e7c63390-eda7-46e0-bb7a-a6abdacd2433";
const SOCKET_BUDDY_LEVEL = "dd3bf334-87f3-40bd-b043-682a57a8dc3a";

// Curated marquee. Order = visual priority in the row. Display names come
// from valorant-api.com via useApiLookup(getWeaponLookup) at render time.
const MARQUEE_WEAPONS = [
  "9c82e19d-4575-0200-1a81-3eacf00cf872", // Vandal
  "ee8e8d15-496b-07ac-e5f6-8fae5d4c7b1a", // Phantom
  "a03b24d3-4319-996d-0f8c-94bbfba1dfc7", // Operator
  "2f59173c-4bed-b6c3-2191-dea9b58be9c7", // Melee
];

// Buy-menu order: sidearms → SMGs → shotguns → rifles → snipers → heavies → melee.
const ALL_WEAPONS = [
  "29a0cfab-485b-f5d5-779a-b59f85e204a8", // Classic
  "42da8ccc-40d5-affc-beec-15aa47b42eda", // Shorty
  "44d4e95c-4157-0037-81b2-17841bf2e8e3", // Frenzy
  "1baa85b4-4c70-1284-64bb-6481dfc3bb4e", // Ghost
  "410b2e0b-4ceb-1321-1727-20858f7f3477", // Bandit
  "e336c6b8-418d-9340-d77f-7a9e4cfe0702", // Sheriff
  "f7e1b454-4ad4-1063-ec0a-159e56b58941", // Stinger
  "462080d1-4035-2937-7c09-27aa2a5c27a7", // Spectre
  "910be174-449b-c412-ab22-d0873436b21b", // Bucky
  "ec845bf4-4f79-ddda-a3da-0db3774b2794", // Judge
  "ae3de142-4d85-2547-dd26-4e90bed35cf7", // Bulldog
  "4ade7faa-4cf1-8376-95ef-39884480959b", // Guardian
  "ee8e8d15-496b-07ac-e5f6-8fae5d4c7b1a", // Phantom
  "9c82e19d-4575-0200-1a81-3eacf00cf872", // Vandal
  "c4883e50-4494-202c-3ec3-6b8a9284f00b", // Marshal
  "5f0aaf7a-4289-3998-d5ff-eb9a5cf7ef5c", // Outlaw
  "a03b24d3-4319-996d-0f8c-94bbfba1dfc7", // Operator
  "55d8a0f4-4274-ca67-fe2c-06ab45efdf58", // Ares
  "63e6c2b6-4a8e-869c-3d4c-e38355226584", // Odin
  "2f59173c-4bed-b6c3-2191-dea9b58be9c7", // Melee
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

const getEquippedSkinLevelUuid = (loadout, weaponUuid) =>
  socketItemId(loadout, weaponUuid, SOCKET_SKIN_LEVEL);
const getEquippedBuddyUuid = (loadout, weaponUuid) =>
  socketItemId(loadout, weaponUuid, SOCKET_BUDDY_LEVEL);

// Both endpoints return Loadouts[]; coregame nests the per-player payload
// under .Loadout, pregame puts it on the entry directly. Either way Subject
// is present, so we don't need a positional fallback.
async function fetchLoadouts({ matchId, phase, addLog }) {
  if (!matchId) return {};
  const phaseArg = phase === "PREGAME" ? "pregame" : "ingame";
  const raw = await invoke("get_match_loadouts", { matchId, phase: phaseArg });
  const data = JSON.parse(raw);
  const entries = data?.Loadouts || [];

  const byPuuid = {};
  for (const entry of entries) {
    const inner = entry?.Loadout || entry;
    const subject = (inner?.Subject || entry?.Subject || "").toLowerCase();
    if (!subject) continue;
    byPuuid[subject] = inner;
    setCache(subject, "loadout", inner);
  }

  addLog?.("info", `[Live] Loadouts ${phaseArg}: ${Object.keys(byPuuid).length} player(s)`);
  return byPuuid;
}

function CardSlot({ data: loadout }) {
  const skinLookup = useApiLookup(getLevelLookup);
  const weaponLookup = useApiLookup(getWeaponLookup);
  if (!loadout) return null;
  return (
    <div className="flex items-center gap-1 mt-1">
      {MARQUEE_WEAPONS.map((uuid) => {
        const lvlId = getEquippedSkinLevelUuid(loadout, uuid);
        const skinMeta = lvlId ? skinLookup[lvlId] : null;
        const weaponName = weaponLookup[uuid]?.displayName || "";
        return (
          <div
            key={uuid}
            className="h-4 w-10 rounded-sm bg-base-600/60 flex items-center justify-center overflow-hidden border border-border/40"
            title={weaponName ? `${weaponName}: ${skinMeta?.name || "default"}` : ""}
          >
            {skinMeta?.icon ? (
              <img
                src={skinMeta.icon}
                alt=""
                className="w-full h-full object-contain"
                loading="lazy"
              />
            ) : (
              <span className="text-[7px] font-body text-text-muted/60">
                {(weaponName[0] || "?").toUpperCase()}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DialogSection({ data: loadout }) {
  const skinLookup = useApiLookup(getLevelLookup);
  const accessoryLookup = useApiLookup(getAccessoryLookup);
  const weaponLookup = useApiLookup(getWeaponLookup);
  if (!loadout) return null;
  // Match-loadout responses wrap spray selections in an inner array, NOT
  // as a flat list. Per-entry shape: { SocketID, SprayID, LevelID } —
  // accessoryLookup keys on the base SprayID.
  const sprays = loadout.Sprays?.SpraySelections || [];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xs font-display font-medium text-text-secondary uppercase tracking-wider mb-2">
          Weapons
        </h3>
        <div className="grid grid-cols-3 gap-2">
          {ALL_WEAPONS.map((uuid) => {
            const lvlId = getEquippedSkinLevelUuid(loadout, uuid);
            const skinMeta = lvlId ? skinLookup[lvlId] : null;
            const buddyId = getEquippedBuddyUuid(loadout, uuid);
            const buddyMeta = buddyId ? accessoryLookup[buddyId] : null;
            const weaponName = weaponLookup[uuid]?.displayName || "";
            return (
              <div
                key={uuid}
                className="p-2 rounded-lg bg-base-700 border border-border flex flex-col gap-1.5"
              >
                <div className="h-10 flex items-center justify-center bg-base-600/40 rounded">
                  {skinMeta?.icon ? (
                    <img
                      src={skinMeta.icon}
                      alt=""
                      className="max-h-9 max-w-full object-contain"
                      loading="lazy"
                    />
                  ) : (
                    <span className="text-[10px] font-body text-text-muted/60">default</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-display font-semibold text-text-muted uppercase tracking-wide">
                    {weaponName}
                  </p>
                  <p
                    className="text-[11px] font-body text-text-primary truncate"
                    title={skinMeta?.name || "Default"}
                  >
                    {skinMeta?.name || "Default"}
                  </p>
                </div>
                {buddyMeta?.image && (
                  <div className="flex items-center gap-1.5 pt-1 border-t border-border/40">
                    <img
                      src={buddyMeta.image}
                      alt=""
                      className="w-4 h-4 object-contain"
                      loading="lazy"
                    />
                    <span
                      className="text-[9px] font-body text-text-muted truncate"
                      title={buddyMeta.name}
                    >
                      {buddyMeta.name}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {sprays.length > 0 && (
        <div>
          <h3 className="text-xs font-display font-medium text-text-secondary uppercase tracking-wider mb-2">
            Sprays
          </h3>
          <div className="flex gap-2">
            {sprays.map((s, i) => {
              const sprayId = (s?.SprayID || "").toLowerCase();
              const meta = sprayId ? accessoryLookup[sprayId] : null;
              return (
                <div
                  key={i}
                  className="flex-1 p-2 rounded-lg bg-base-700 border border-border flex flex-col items-center gap-1"
                >
                  <div className="w-12 h-12 flex items-center justify-center bg-base-600/40 rounded">
                    {meta?.image ? (
                      <img
                        src={meta.image}
                        alt=""
                        className="max-h-11 max-w-full object-contain"
                        loading="lazy"
                      />
                    ) : (
                      <span className="text-[10px] font-body text-text-muted/60">—</span>
                    )}
                  </div>
                  <span
                    className="text-[10px] font-body text-text-muted truncate w-full text-center"
                    title={meta?.name}
                  >
                    {meta?.name || "—"}
                  </span>
                </div>
              );
            })}
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
