// Lazy lookups against valorant-api.com. Each builder caches its result so
// later callers (and component re-renders) don't re-fetch. All maps are
// keyed by lowercase UUID to match the casing the storefront returns.

let weaponsPromise = null;
let levelLookup = null;

export async function getLevelLookup() {
  if (levelLookup) return levelLookup;
  if (!weaponsPromise) {
    weaponsPromise = fetch("https://valorant-api.com/v1/weapons")
      .then(r => r.json())
      .then(d => d.data);
  }
  const weapons = await weaponsPromise;
  const out = {};
  for (const w of weapons) {
    for (const skin of w.skins || []) {
      const tier = skin.contentTierUuid?.toLowerCase();
      const baseLevel = (skin.levels || [])[0];
      for (const lvl of skin.levels || []) {
        out[lvl.uuid.toLowerCase()] = {
          levelUuid: lvl.uuid.toLowerCase(),
          skinUuid: skin.uuid.toLowerCase(),
          name: skin.displayName,
          icon: lvl.displayIcon || skin.displayIcon || baseLevel?.displayIcon || "",
          tier,
          weapon: w.displayName,
        };
      }
    }
  }
  levelLookup = out;
  return out;
}

let bundleLookup = null;
let bundlesPromise = null;

// Maps bundle UUID → { displayName, displayIcon, verticalPromoImage }. Used
// by the Featured Bundle hero card so we render the bundle's name + image
// instead of the raw DataAssetID.
export async function getBundleLookup() {
  if (bundleLookup) return bundleLookup;
  if (!bundlesPromise) {
    bundlesPromise = fetch("https://valorant-api.com/v1/bundles")
      .then(r => r.json())
      .then(d => d.data);
  }
  const bundles = await bundlesPromise;
  const out = {};
  for (const b of bundles) {
    if (!b?.uuid) continue;
    out[b.uuid.toLowerCase()] = {
      displayName: b.displayName,
      displayIcon: b.displayIcon || null,
      verticalPromoImage: b.verticalPromoImage || null,
    };
  }
  bundleLookup = out;
  return out;
}

let accessoryLookup = null;
let accessoryPromise = null;

// Unified map of accessory UUIDs → { kind, name, image }. Storefront
// rewards reference these by UUID; the buddies case is special because the
// storefront returns buddy *level* UUIDs, not buddy UUIDs — we flatten
// every level into the top-level map.
export async function getAccessoryLookup() {
  if (accessoryLookup) return accessoryLookup;
  if (!accessoryPromise) {
    // allSettled rather than all so one 5xx endpoint doesn't kill the whole
    // catalog — accessory cards for the surviving kinds still resolve.
    accessoryPromise = Promise.allSettled([
      fetch("https://valorant-api.com/v1/buddies").then(r => r.json()),
      fetch("https://valorant-api.com/v1/sprays").then(r => r.json()),
      fetch("https://valorant-api.com/v1/playercards").then(r => r.json()),
      fetch("https://valorant-api.com/v1/playertitles").then(r => r.json()),
    ]);
  }
  const [buddiesR, spraysR, cardsR, titlesR] = await accessoryPromise;
  const ok = (r) => r.status === "fulfilled" ? r.value : null;
  const buddies = ok(buddiesR);
  const sprays = ok(spraysR);
  const cards = ok(cardsR);
  const titles = ok(titlesR);
  const out = {};

  for (const b of buddies?.data || []) {
    for (const lvl of b.levels || []) {
      if (!lvl?.uuid) continue;
      out[lvl.uuid.toLowerCase()] = {
        kind: "buddy",
        name: b.displayName,
        image: lvl.displayIcon || b.displayIcon || null,
      };
    }
  }
  for (const s of sprays?.data || []) {
    if (!s?.uuid) continue;
    out[s.uuid.toLowerCase()] = {
      kind: "spray",
      name: s.displayName,
      image: s.fullIcon || s.displayIcon || s.fullTransparentIcon || null,
    };
  }
  for (const c of cards?.data || []) {
    if (!c?.uuid) continue;
    out[c.uuid.toLowerCase()] = {
      kind: "card",
      name: c.displayName,
      image: c.smallArt || c.displayIcon || null,
    };
  }
  for (const t of titles?.data || []) {
    if (!t?.uuid) continue;
    // Titles have no image — the card renders the text instead.
    out[t.uuid.toLowerCase()] = {
      kind: "title",
      name: t.titleText || t.displayName,
      image: null,
    };
  }

  accessoryLookup = out;
  return out;
}
