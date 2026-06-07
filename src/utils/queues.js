// Queue lists surfaced by the party picker (PartyPage) and the
// fake-presence picker (FakeStatusPage).
//
// Two curated lists, not a single source of truth:
//   - ALL_QUEUES        — the full canonical set including spoof-only
//                         sentinels like "newmap: None" and the modes
//                         you can spoof without being able to queue.
//   - PARTY_QUEUES      — the subset PartyPage exposes for live queueing,
//                         ordered the way PartyPage renders them.
// Renames or label tweaks happen here; pages just import.

export const ALL_QUEUES = [
  { id: "newmap", label: "None" },
  { id: "unrated", label: "Unrated" },
  { id: "competitive", label: "Competitive" },
  { id: "spikerush", label: "Spike Rush" },
  { id: "deathmatch", label: "Deathmatch" },
  { id: "swiftplay", label: "Swiftplay" },
  { id: "hurm", label: "Team Deathmatch" },
  { id: "premier", label: "Premier" },
  { id: "ggteam", label: "Escalation" },
  { id: "skirmish2v2", label: "Skirmish: 2v2" },
  { id: "skirmishascension1v1", label: "Skirmish: Ascension 1v1" },
  { id: "skirmishascension2v2", label: "Skirmish: Ascension 2v2" },
  { id: "onefa", label: "Replication" },
  { id: "snowball", label: "Snowball Fight" },
  { id: "valaram", label: "All Random One Site" },
  { id: "dodgeball", label: "Knockout" },
  { id: "custom", label: "Custom Game" },
];

export const PARTY_QUEUES = [
  { id: "unrated", label: "Unrated" },
  { id: "competitive", label: "Competitive" },
  { id: "swiftplay", label: "Swiftplay" },
  { id: "deathmatch", label: "Deathmatch" },
  { id: "hurm", label: "Team Deathmatch" },
  { id: "ggteam", label: "Escalation" },
  { id: "spikerush", label: "Spike Rush" },
  { id: "skirmish2v2", label: "Skirmish: 2v2" },
  { id: "skirmishascension1v1", label: "Skirmish: Ascension 1v1" },
  { id: "skirmishascension2v2", label: "Skirmish: Ascension 2v2" },
];
