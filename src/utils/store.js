// Storefront cost parsing + countdown formatting, shared by StorePage and
// its card components. Currency UUIDs come from Riot's /store/v1 payloads —
// the same ids key both offer costs and wallet balances.
export const COST_VP = "85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741";
export const COST_RP = "e59aa87c-4cbf-517a-5983-6e81511be9b7";
export const COST_KC = "85ca954a-41f2-ce94-9b45-8ca3dd39a00d";

export function fmtCost(cost) {
  if (!cost || typeof cost !== "object") return null;
  const vp = cost[COST_VP];
  const rp = cost[COST_RP];
  const kc = cost[COST_KC];
  if (vp != null) return { amount: vp, currency: "VP" };
  if (rp != null) return { amount: rp, currency: "RP" };
  if (kc != null) return { amount: kc, currency: "KC" };
  const first = Object.values(cost)[0];
  return first != null ? { amount: first, currency: "" } : null;
}

export function fmtRemaining(seconds) {
  if (seconds == null || seconds < 0) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h >= 24) {
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h`;
  }
  if (h > 0) return `${h}h ${m}m`;
  const s = seconds % 60;
  return `${m}m ${s}s`;
}
