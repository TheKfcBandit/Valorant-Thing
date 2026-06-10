import { invoke } from "@tauri-apps/api/core";

// Riot entitlement item-type UUIDs (PD /store/v1/entitlements groups).
// Per the public endpoint docs: e7c63390 is "Skins" (entitlements are skin
// LEVEL uuids — what the store sells), 3ad1b2b2 is "Skin Variants"
// (chromas). These two were historically swapped here, which is what fed
// chroma ids into the spend tracker (#41 follow-up).
export const ITEM_TYPES = {
  SKIN_LEVEL: "e7c63390-eda7-46e0-bb7a-a6abdacd2433",
  SKIN_CHROMA: "3ad1b2b2-acdb-4524-852f-954a76ddae0a",
  BUDDY: "dd3bf334-87f3-40bd-b043-682a57a8dc3a",
  SPRAY: "d5f120f8-ff8c-4aac-92ea-f2b5acbe9475",
  CARD: "3f296c07-64c3-494c-923b-fe692a4fa1bd",
  TITLE: "de7caa6b-adf7-4588-bbd1-143831e786c6",
};

export const CATEGORY_ORDER = {
  "EEquippableCategory::Sidearm": 0,
  "EEquippableCategory::SMG": 1,
  "EEquippableCategory::Shotgun": 2,
  "EEquippableCategory::Rifle": 3,
  "EEquippableCategory::Sniper": 4,
  "EEquippableCategory::Heavy": 5,
  "EEquippableCategory::Melee": 6,
};

export const CATEGORY_LABELS = {
  "EEquippableCategory::Sidearm": "SIDEARMS",
  "EEquippableCategory::SMG": "SMGS",
  "EEquippableCategory::Shotgun": "SHOTGUNS",
  "EEquippableCategory::Rifle": "RIFLES",
  "EEquippableCategory::Sniper": "SNIPERS",
  "EEquippableCategory::Heavy": "HEAVY WEAPONS",
  "EEquippableCategory::Melee": "MELEE",
};

export const SPRAY_SLOTS = [
  { id: "0814b2fe-4512-60a4-5288-1fbdcec6ca48", label: "Pre-Round" },
  { id: "04af080a-4071-487b-61c0-5b9c0cfaac74", label: "Mid-Round" },
  { id: "5863985e-43ac-b05d-cb2d-139e72970571", label: "Post-Round" },
];

const apiCache = {};
export async function apiFetch(endpoint) {
  if (apiCache[endpoint]) return apiCache[endpoint];
  const res = await fetch(`https://valorant-api.com/v1/${endpoint}`);
  const data = await res.json();
  apiCache[endpoint] = data.data;
  return data.data;
}

export async function fetchOwnedIds(typeId) {
  try {
    const raw = await invoke("get_owned_items", { itemTypeId: typeId });
    const json = JSON.parse(raw);
    let items = [];
    if (json.Entitlements) {
      items = json.Entitlements;
    } else if (json.EntitlementsByTypes) {
      for (const group of json.EntitlementsByTypes) {
        items.push(...(group.Entitlements || []));
      }
    }
    return new Set(items.map((e) => e.ItemID.toLowerCase()));
  } catch (e) {
    console.error(`[Loadout] Failed to fetch owned ${typeId}:`, e);
    return new Set();
  }
}

export function findSkinByLevel(weapon, levelId) {
  if (!weapon?.skins || !levelId) return null;
  for (const skin of weapon.skins) {
    if (skin.levels?.some((l) => l.uuid.toLowerCase() === levelId.toLowerCase())) return skin;
  }
  return null;
}

export function findChroma(skin, chromaId) {
  if (!skin?.chromas || !chromaId) return null;
  return skin.chromas.find((c) => c.uuid.toLowerCase() === chromaId.toLowerCase()) || null;
}

export function getSkinImg(skin, chroma) {
  if (chroma) return chroma.fullRender || chroma.displayIcon || skin?.displayIcon;
  return skin?.chromas?.[0]?.fullRender || skin?.chromas?.[0]?.displayIcon || skin?.displayIcon;
}

export function getAllSkins(weapon) {
  if (!weapon?.skins) return [];
  return weapon.skins.filter(
    (s) => s.displayIcon || s.chromas?.[0]?.displayIcon || s.chromas?.[0]?.fullRender
  );
}
