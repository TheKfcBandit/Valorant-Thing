// Riot game pod IDs encode the server region + city in a hyphenated form
// (e.g. "aresriot.aws-mtl-1.na-gp-ashburn-1"). This extracts a human
// label like "NA - Ashburn" from that. Falls back to a sensible best-
// effort split when the canonical "gp" segment isn't present.
export function parseGamePod(podId) {
  if (!podId) return "";
  const parts = podId.split("-");
  const gpIdx = parts.indexOf("gp");
  if (gpIdx >= 0 && gpIdx + 1 < parts.length) {
    const region =
      parts
        .slice(0, gpIdx)
        .find((p) => ["na", "eu", "ap", "kr", "br", "latam"].includes(p))
        ?.toUpperCase() || "";
    const city =
      parts[gpIdx + 1].charAt(0).toUpperCase() + parts[gpIdx + 1].slice(1).replace(/\d+$/, "");
    return region ? `${region} - ${city}` : city;
  }
  return podId.split(".").pop()?.split("-").slice(0, 2).join(" ") || podId;
}
