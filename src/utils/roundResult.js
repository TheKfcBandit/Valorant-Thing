// Helpers for the per-round entries inside `details.roundResults` from
// Riot's GET match-details. Fields are accessed defensively because no
// other call site in the codebase consumes them yet, and the public
// schema is the only source of truth for the names.

// Single-character glyph for the round's win condition. Kept tiny so it
// fits inside a 7×7 pill alongside the round number.
export const ROUND_GLYPH = {
  Detonate: "B", // spike detonated
  Defuse: "D", // spike defused
  Elimination: "E", // all enemies dead
  Surrendered: "S",
};

// Which side of a round, relative to the viewer's own team. `selfTeam`
// is expected lowercased ("red" / "blue") — same convention used by the
// match-details modal when comparing player teamIds.
export function getRoundOutcome(round, selfTeam) {
  const winner = String(round?.winningTeam || "").toLowerCase();
  if (!winner || !selfTeam) return "unknown";
  return winner === selfTeam ? "won" : "lost";
}

// Multi-line tooltip describing one round. `nameByPuuid` resolves the
// planter / defuser PUUIDs to display names; pass an empty Map if you
// don't have player identity (the lines for unresolved PUUIDs are
// dropped rather than rendered as raw UUIDs).
export function formatRoundTooltip(round, nameByPuuid) {
  const lines = [];
  const num = (round?.roundNum ?? 0) + 1;
  lines.push(`Round ${num}`);
  const winner = String(round?.winningTeam || "").trim();
  if (winner) lines.push(`Winner: ${winner}`);
  const code = round?.roundResultCode;
  const result = round?.roundResult;
  if (result) lines.push(result);
  else if (code) lines.push(code);
  const site = String(round?.plantSite || "").trim();
  const planter = round?.bombPlanter;
  if (planter && nameByPuuid.has(planter)) {
    lines.push(`Plant${site ? ` (${site})` : ""}: ${nameByPuuid.get(planter)}`);
  } else if (site) {
    lines.push(`Plant: ${site}`);
  }
  const defuser = round?.bombDefuser;
  if (defuser && nameByPuuid.has(defuser)) {
    lines.push(`Defuse: ${nameByPuuid.get(defuser)}`);
  }
  const ceremony = String(round?.roundCeremony || "");
  if (ceremony && ceremony !== "CeremonyDefault") {
    lines.push(ceremony.replace(/^Ceremony/, ""));
  }
  return lines.join("\n");
}
