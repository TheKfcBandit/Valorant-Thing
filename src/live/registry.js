// Live-tab module registry. Each module is a self-contained feature that
// plugs into the per-player views in the Live tab.
//
// Contract (LiveModule):
//   id: string                    unique key, used for caching + diagnostics
//   label: string                 human label, shown as section header in the dialog
//   fetch?(ctx): Promise<Record<puuid, data> | null>
//                                 optional async fetch run once per
//                                 (matchId, phase). Receives:
//                                   ctx = { matchId, phase, players, addLog }
//                                 Returns a puuid-keyed map of per-player
//                                 data, or null to skip. Throwing is fine —
//                                 the orchestrator logs + continues.
//   CardSlot?: Component          optional inline component rendered inside
//                                 PlayerCard. Props: { player, data }.
//                                 Should render nothing (return null) if it
//                                 has nothing to show for this player.
//   DialogSection?: Component     optional section rendered inside the
//                                 player detail dialog. Same prop shape.
//
// Modules MUST NOT reach into MatchInfoPage state directly. Anything they
// need (skin metadata, accessory metadata, agent map, etc.) is either
// fetched inside the module via valorant-api singletons, or passed via
// props on the slot components. This keeps modules drop-in: add a file
// here, register it below, done.

import { loadoutModule } from "./loadoutModule.jsx";

export const LIVE_MODULES = [loadoutModule];
