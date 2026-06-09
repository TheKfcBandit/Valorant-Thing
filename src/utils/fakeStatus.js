// Lookup tables for the fake-presence editor. Tier numbers map to Riot's
// competitivetiers content; division ids to Premier's ladder.
const TIER_UUID = "03621f52-342b-cf4e-4f86-9350a49c6d04";
export const rankIcon = (tier) =>
  `https://media.valorant-api.com/competitivetiers/${TIER_UUID}/${tier}/smallicon.png`;

export const RANKS = [
  { tier: 0, name: "Unranked" },
  { tier: 3, name: "Iron 1" },
  { tier: 4, name: "Iron 2" },
  { tier: 5, name: "Iron 3" },
  { tier: 6, name: "Bronze 1" },
  { tier: 7, name: "Bronze 2" },
  { tier: 8, name: "Bronze 3" },
  { tier: 9, name: "Silver 1" },
  { tier: 10, name: "Silver 2" },
  { tier: 11, name: "Silver 3" },
  { tier: 12, name: "Gold 1" },
  { tier: 13, name: "Gold 2" },
  { tier: 14, name: "Gold 3" },
  { tier: 15, name: "Platinum 1" },
  { tier: 16, name: "Platinum 2" },
  { tier: 17, name: "Platinum 3" },
  { tier: 18, name: "Diamond 1" },
  { tier: 19, name: "Diamond 2" },
  { tier: 20, name: "Diamond 3" },
  { tier: 21, name: "Ascendant 1" },
  { tier: 22, name: "Ascendant 2" },
  { tier: 23, name: "Ascendant 3" },
  { tier: 24, name: "Immortal 1" },
  { tier: 25, name: "Immortal 2" },
  { tier: 26, name: "Immortal 3" },
  { tier: 27, name: "Radiant" },
];

export const PREMIER_DIVISIONS = [
  { id: 0, name: "Unranked", icon: "—", color: "#888" },
  { id: 1, name: "Open 1", icon: "I", color: "#B0BEC5" },
  { id: 2, name: "Open 2", icon: "II", color: "#B0BEC5" },
  { id: 3, name: "Open 3", icon: "III", color: "#B0BEC5" },
  { id: 4, name: "Inter. 1", icon: "I", color: "#FFD740" },
  { id: 5, name: "Inter. 2", icon: "II", color: "#FFD740" },
  { id: 6, name: "Inter. 3", icon: "III", color: "#FFD740" },
  { id: 7, name: "Advanced 1", icon: "I", color: "#CE93D8" },
  { id: 8, name: "Advanced 2", icon: "II", color: "#CE93D8" },
  { id: 9, name: "Advanced 3", icon: "III", color: "#CE93D8" },
  { id: 10, name: "Elite 1", icon: "I", color: "#FF7043" },
  { id: 11, name: "Elite 2", icon: "II", color: "#FF7043" },
  { id: 12, name: "Contender", icon: "★", color: "#E040FB" },
];

export const STATUS_MODES = [
  { id: "online", name: "Online" },
  { id: "away", name: "Away" },
  { id: "hidden", name: "Hidden" },
  { id: "invisible", name: "Invisible" },
];

export const SESSION_STATES = [
  { id: "MENUS", name: "Menu" },
  { id: "PREGAME", name: "Agent Select" },
  { id: "INGAME", name: "In Game" },
];
