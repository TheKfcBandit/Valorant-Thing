// Display labels for Valorant queues and game modes. Two key shapes
// coexist intentionally:
//
//   - Lower-case queue IDs ("competitive", "deathmatch", …) — match
//     `Provisioning.QueueId` from Riot's party/queue endpoints.
//   - Unreal GameMode class names ("BombGameMode", …) — match the
//     trailing class fragment of `MatchInfo.QueueID`'s `GameMode`
//     URL (e.g. `/Game/.../BombGameMode_C`).
//
// Both flow through the same lookup because `resolveModeName` does
// either an exact-match (`queueId === key`) or an `includes(key)`
// substring search on the URL form. No value collisions between the
// two key shapes.
export const MODE_NAMES = {
  competitive: "Competitive",
  unrated: "Unrated",
  deathmatch: "Deathmatch",
  spikerush: "Spike Rush",
  swiftplay: "Swiftplay",
  ggteam: "Escalation",
  hurm: "Team Deathmatch",
  premier: "Premier",
  newmap: "New Map",
  snowball: "Snowball Fight",
  onefa: "Replication",
  skirmish2v2: "Skirmish: 2v2",
  skirmishascension1v1: "Skirmish: Ascension 1v1",
  skirmishascension2v2: "Skirmish: Ascension 2v2",
  valaram: "All Random One Site",
  dodgeball: "Knockout",
  custom: "Custom",
  BombGameMode: "Standard",
  DeathmatchGameMode: "Deathmatch",
  GunGameTeamsGameMode: "Escalation",
  QuickBombGameMode: "Spike Rush",
  OneForAll_GameMode: "Replication",
  Swiftplay_EoRCredits_GameMode: "Swiftplay",
  SwiftPlayGameMode: "Swiftplay",
  HURM_GameMode: "Team Deathmatch",
  SnowballGameMode: "Snowball Fight",
  NewMapGameMode: "New Map",
};

// Strip a Riot mode URL like `/Game/GameModes/Bomb/BombGameMode.BombGameMode_C`
// down to a lowercase tail token ("bombgamemode_c"). Used by PartyPage.
export function normalizeModeKey(mode) {
  return (
    String(mode || "")
      .split("/")
      .pop()
      ?.split(".")[0]
      ?.toLowerCase() || ""
  );
}

// Best-effort display name from either a queue ID or a mode URL.
// Falls back to `queueId` (raw) and finally "Custom".
export function resolveModeName(queueId = "", modeUrl = "") {
  const key = Object.keys(MODE_NAMES).find((k) => queueId === k || modeUrl.includes(k));
  return key ? MODE_NAMES[key] : queueId || "Custom";
}
