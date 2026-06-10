// Lazy lookups against valorant-api.com. Each builder caches its result so
// later callers (and component re-renders) don't re-fetch. All maps are
// keyed by lowercase UUID to match the casing the storefront returns.
//
// Pattern per resource:
//   getX()       memoized fetch returning the raw API array
//   getXLookup() memoized keyed view built from getX() — consumers that
//                want a different shape should project locally rather than
//                add a third entry point.

import { CUSTOM_AGENTS } from "./utils/agents";

const VAL_API = "https://valorant-api.com/v1";

// --- Weapons (shared by weapon + skin-level lookups) -----------------------

let weaponsPromise = null;
let weaponLookup = null;
let levelLookup = null;

async function getWeapons() {
  if (!weaponsPromise) {
    weaponsPromise = fetch(`${VAL_API}/weapons`)
      .then((r) => r.json())
      .then((d) => d.data);
  }
  return weaponsPromise;
}

// Maps weaponUuid → { displayName, category, displayIcon }.
export async function getWeaponLookup() {
  if (weaponLookup) return weaponLookup;
  const weapons = await getWeapons();
  const out = {};
  for (const w of weapons) {
    if (!w?.uuid) continue;
    out[w.uuid.toLowerCase()] = {
      displayName: w.displayName,
      category: w.shopData?.category || "",
      displayIcon: w.displayIcon || "",
    };
  }
  weaponLookup = out;
  return out;
}

// Maps skin-level UUID → { skinUuid, name, icon, tier, weapon }.
export async function getLevelLookup() {
  if (levelLookup) return levelLookup;
  const weapons = await getWeapons();
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

// --- Maps ------------------------------------------------------------------

let mapsPromise = null;
let mapLookup = null;

export async function getMaps() {
  if (!mapsPromise) {
    mapsPromise = fetch(`${VAL_API}/maps`)
      .then((r) => r.json())
      .then((d) => d.data || []);
  }
  return mapsPromise;
}

// Indexed by both uuid AND mapUrl (both lowercase). Consumers that key by
// the trailing slug of mapUrl (e.g. HomePage, WrappedPage) should iterate
// the raw array from getMaps() and derive their own slim shape.
export async function getMapLookup() {
  if (mapLookup) return mapLookup;
  const maps = await getMaps();
  const out = {};
  for (const m of maps) {
    if (m?.uuid) out[m.uuid.toLowerCase()] = m;
    if (m?.mapUrl) out[m.mapUrl.toLowerCase()] = m;
  }
  mapLookup = out;
  return out;
}

// --- Agents (playable + custom) -------------------------------------------

let agentsPromise = null;
let agentLookup = null;

export async function getAgents() {
  if (!agentsPromise) {
    agentsPromise = fetch(`${VAL_API}/agents?isPlayableCharacter=true`)
      .then((r) => r.json())
      .then((d) => {
        const apiAgents = d.data || [];
        const existing = new Set(apiAgents.map((a) => a.uuid.toLowerCase()));
        const extras = CUSTOM_AGENTS.filter((c) => !existing.has(c.uuid.toLowerCase()));
        return [...apiAgents, ...extras];
      });
  }
  return agentsPromise;
}

export async function getAgentLookup() {
  if (agentLookup) return agentLookup;
  const agents = await getAgents();
  const out = {};
  for (const a of agents) {
    if (a?.uuid) out[a.uuid.toLowerCase()] = a;
  }
  agentLookup = out;
  return out;
}

// --- Competitive tiers (flat latest-episode view) -------------------------

let tiersPromise = null;
let tierLookup = null;

// Indexed by tier number (0 = unranked, 27 = Radiant). Each entry: { name, icon }.
// The "Unused1"/"Unused2" placeholder tier names are normalized to "Unranked".
export async function getTierLookup() {
  if (tierLookup) return tierLookup;
  if (!tiersPromise) {
    tiersPromise = fetch(`${VAL_API}/competitivetiers`)
      .then((r) => r.json())
      .then((d) => d.data || []);
  }
  const episodes = await tiersPromise;
  const out = {};
  const latest = episodes[episodes.length - 1];
  if (latest) {
    for (const t of latest.tiers || []) {
      const placeholder = t.tierName === "Unused1" || t.tierName === "Unused2";
      out[t.tier] = { name: placeholder ? "Unranked" : t.tierName, icon: t.smallIcon };
    }
  }
  tierLookup = out;
  return out;
}

// --- Game modes -----------------------------------------------------------

let gameModesPromise = null;
let gameModeLookup = null;

export async function getGameModes() {
  if (!gameModesPromise) {
    gameModesPromise = fetch(`${VAL_API}/gamemodes`)
      .then((r) => r.json())
      .then((d) => d.data || []);
  }
  return gameModesPromise;
}

// Indexed by the trailing class name of assetPath (lowercase) — matches the
// shape PartyPage's mode-icon lookups consume.
export async function getGameModeLookup() {
  if (gameModeLookup) return gameModeLookup;
  const modes = await getGameModes();
  const out = {};
  for (const m of modes) {
    const cls = (m?.assetPath || "").split("/").pop()?.toLowerCase();
    if (cls) out[cls] = m;
  }
  gameModeLookup = out;
  return out;
}

// --- Bundles --------------------------------------------------------------

let bundleLookup = null;
let bundlesPromise = null;

// Maps bundle UUID → { displayName, displayIcon, verticalPromoImage }. Used
// by the Featured Bundle hero card so we render the bundle's name + image
// instead of the raw DataAssetID.
export async function getBundleLookup() {
  if (bundleLookup) return bundleLookup;
  if (!bundlesPromise) {
    bundlesPromise = fetch(`${VAL_API}/bundles`)
      .then((r) => r.json())
      .then((d) => d.data);
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

// --- Accessories (buddies + sprays + cards + titles) ----------------------

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
      fetch(`${VAL_API}/buddies`).then((r) => r.json()),
      fetch(`${VAL_API}/sprays`).then((r) => r.json()),
      fetch(`${VAL_API}/playercards`).then((r) => r.json()),
      fetch(`${VAL_API}/playertitles`).then((r) => r.json()),
    ]);
  }
  const [buddiesR, spraysR, cardsR, titlesR] = await accessoryPromise;
  const ok = (r) => (r.status === "fulfilled" ? r.value : null);
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
      // animationGif animates; displayIcon is the static single-frame.
      // fullIcon is a multi-frame spritesheet — last resort so we don't
      // render strips of frames as if they were a single image.
      name: s.displayName,
      image: s.animationGif || s.displayIcon || s.fullTransparentIcon || s.fullIcon || null,
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

// --- Assets browser catalogs (#28) -----------------------------------------
//
// Flat arrays for the Assets tab, one entry per browsable item. Each `id`
// is the UUID the wishlist/store pipeline keys on: a skin's BASE level
// uuid (what storefront offers reference), a buddy's first level uuid
// (what the accessory store sells), and the plain uuid for the rest.

let skinCatalog = null;

export async function getSkinCatalog() {
  if (skinCatalog) return skinCatalog;
  const weapons = await getWeapons();
  const out = [];
  for (const w of weapons || []) {
    for (const skin of w.skins || []) {
      const baseLevel = (skin.levels || [])[0];
      if (!baseLevel?.uuid) continue;
      out.push({
        id: baseLevel.uuid.toLowerCase(),
        kind: "skin",
        name: skin.displayName,
        image: baseLevel.displayIcon || skin.displayIcon || null,
        tier: skin.contentTierUuid?.toLowerCase() || null,
        weapon: w.displayName,
      });
    }
  }
  out.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  skinCatalog = out;
  return out;
}

let accessoryCatalog = null;

export async function getAccessoryCatalog() {
  if (accessoryCatalog) return accessoryCatalog;
  const lookup = await getAccessoryLookup();
  const out = [];
  const seenBuddies = new Set();
  for (const [id, meta] of Object.entries(lookup)) {
    // The lookup holds one entry per buddy LEVEL; multi-level buddies
    // would otherwise show as duplicates in the browser.
    if (meta.kind === "buddy") {
      if (seenBuddies.has(meta.name)) continue;
      seenBuddies.add(meta.name);
    }
    out.push({ id, kind: meta.kind, name: meta.name, image: meta.image, tier: null, weapon: null });
  }
  out.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  accessoryCatalog = out;
  return out;
}
