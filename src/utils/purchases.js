// Pure shaping for the Purchase History panel (#41). Input is the
// spend-tracker ledger: [{ skin_level_uuid, date_ms, vp, rp, kc }] —
// our own Rust shape, not a raw Riot payload. `date_ms` is when the app
// first noticed the item was owned, not Riot's transaction time; the UI
// labels it accordingly.

export function sumPurchases(purchases) {
  const out = { vp: 0, rp: 0, kc: 0 };
  for (const p of purchases || []) {
    out.vp += Number(p?.vp) || 0;
    out.rp += Number(p?.rp) || 0;
    out.kc += Number(p?.kc) || 0;
  }
  return out;
}

// Newest month first; purchases within a month newest first. `key` sorts
// lexicographically ("2026-06"); `label` is for display ("June 2026").
export function groupPurchasesByMonth(purchases) {
  const byKey = new Map();
  for (const p of purchases || []) {
    const ms = Number(p?.date_ms) || 0;
    const d = new Date(ms);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        label: d.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
        purchases: [],
      });
    }
    byKey.get(key).purchases.push(p);
  }
  const groups = [...byKey.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
  for (const g of groups) {
    g.purchases.sort((a, b) => (Number(b.date_ms) || 0) - (Number(a.date_ms) || 0));
    g.totals = sumPurchases(g.purchases);
  }
  return groups;
}
