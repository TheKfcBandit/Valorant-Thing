import { useState, useEffect, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "framer-motion";
import { LoadoutTab, RefreshCcw, Spinner } from "../icons";
import { formatError } from "../utils/authError";
import {
  ITEM_TYPES,
  CATEGORY_ORDER,
  CATEGORY_LABELS,
  SPRAY_SLOTS,
  apiFetch,
  fetchOwnedIds,
} from "../utils/loadout";
import { Img } from "./loadout/Img";
import { SkinPicker } from "./loadout/SkinPicker";
import { GridPicker } from "./loadout/GridPicker";
import { PresetsPanel } from "./loadout/PresetsPanel";
import { WeaponCard, SprayCard, IdentityCards } from "./loadout/CollectionCards";

export default function LoadoutPage({ connected }) {
  const [weapons, setWeapons] = useState([]);
  const [sprays, setSprays] = useState([]);
  const [cards, setCards] = useState([]);
  const [titles, setTitles] = useState([]);
  const [_buddies, setBuddies] = useState([]);
  const [loadout, setLoadout] = useState(null);
  const [pending, setPending] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [owned, setOwned] = useState({
    levels: new Set(),
    chromas: new Set(),
    buddies: new Set(),
    sprays: new Set(),
    cards: new Set(),
    titles: new Set(),
  });
  const [picker, setPicker] = useState(null);
  const [search, setSearch] = useState("");
  const [favoriteSkins, setFavoriteSkins] = useState(() => {
    try {
      const arr = JSON.parse(localStorage.getItem("favorite_skins") || "[]");
      return new Set(
        (Array.isArray(arr) ? arr : []).filter((s) => s != null).map((s) => String(s).toLowerCase())
      );
    } catch {
      return new Set();
    }
  });
  const [favoriteLevels, setFavoriteLevels] = useState(() => {
    try {
      const arr = JSON.parse(localStorage.getItem("favorite_levels") || "[]");
      return new Set(
        (Array.isArray(arr) ? arr : []).filter((s) => s != null).map((s) => String(s).toLowerCase())
      );
    } catch {
      return new Set();
    }
  });

  const hasChanges = useMemo(() => {
    if (!loadout || !pending) return false;
    return JSON.stringify(loadout) !== JSON.stringify(pending);
  }, [loadout, pending]);

  const fetchAll = useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    setError(null);
    try {
      const [weaps, sprayData, cardData, titleData, buddyData, loadoutRaw] = await Promise.all([
        apiFetch("weapons"),
        apiFetch("sprays"),
        apiFetch("playercards"),
        apiFetch("playertitles"),
        apiFetch("buddies"),
        invoke("get_loadout"),
      ]);
      setWeapons(weaps);
      setSprays(sprayData);
      setCards(cardData);
      setTitles(titleData);
      setBuddies(buddyData);
      const parsed = JSON.parse(loadoutRaw);
      setLoadout(parsed);
      setPending(JSON.parse(JSON.stringify(parsed)));

      const [levels, chromas, buds, sprys, crds, ttls] = await Promise.all([
        fetchOwnedIds(ITEM_TYPES.SKIN_LEVEL),
        fetchOwnedIds(ITEM_TYPES.SKIN_CHROMA),
        fetchOwnedIds(ITEM_TYPES.BUDDY),
        fetchOwnedIds(ITEM_TYPES.SPRAY),
        fetchOwnedIds(ITEM_TYPES.CARD),
        fetchOwnedIds(ITEM_TYPES.TITLE),
      ]);
      setOwned({ levels, chromas, buddies: buds, sprays: sprys, cards: crds, titles: ttls });
    } catch (e) {
      setError(formatError(e, "Failed to load"));
    } finally {
      setLoading(false);
    }
  }, [connected]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handlePresetApplied = useCallback(async () => {
    setSuccessMsg("Preset applied! Restart game to see changes.");
    setTimeout(() => setSuccessMsg(null), 3000);
    await fetchAll();
  }, [fetchAll]);

  const weaponsByCategory = useMemo(() => {
    const groups = {};
    for (const w of weapons) {
      const cat = w.category || "Unknown";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(w);
    }
    return Object.entries(groups).sort(
      ([a], [b]) => (CATEGORY_ORDER[a] ?? 99) - (CATEGORY_ORDER[b] ?? 99)
    );
  }, [weapons]);

  const getEquipped = useCallback(
    (weaponUuid) => {
      return pending?.Guns?.find((g) => g.ID.toLowerCase() === weaponUuid.toLowerCase());
    },
    [pending]
  );

  const equipSkin = useCallback((weaponUuid, skin, chroma, level) => {
    setPending((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      const gun = next.Guns?.find((g) => g.ID.toLowerCase() === weaponUuid.toLowerCase());
      if (!gun) return prev;
      gun.SkinID = skin.uuid;
      gun.SkinLevelID =
        level?.uuid || skin.levels?.[skin.levels.length - 1]?.uuid || gun.SkinLevelID;
      gun.ChromaID = chroma?.uuid || skin.chromas?.[0]?.uuid || gun.ChromaID;
      return next;
    });
  }, []);

  const equipSpray = useCallback((slotId, sprayUuid) => {
    setPending((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      const slot = next.Sprays?.find((s) => s.EquipSlotID === slotId);
      if (slot) slot.SprayID = sprayUuid;
      return next;
    });
  }, []);

  const equipCard = useCallback((cardId) => {
    setPending((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      if (next.Identity) next.Identity.PlayerCardID = cardId;
      return next;
    });
  }, []);

  const equipTitle = useCallback((titleId) => {
    setPending((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      if (next.Identity) next.Identity.PlayerTitleID = titleId;
      return next;
    });
  }, []);

  const saveLoadout = useCallback(async () => {
    if (!pending || saving) return;
    setSaving(true);
    setError(null);
    try {
      const body = {
        Guns: pending.Guns,
        Sprays: pending.Sprays,
        Identity: pending.Identity,
        Incognito: pending.Incognito,
      };
      const jsonStr = JSON.stringify(body);
      await invoke("set_loadout", { loadoutJson: jsonStr });
      const verifyRaw = await invoke("get_loadout");
      const verified = JSON.parse(verifyRaw);
      setLoadout(verified);
      setPending(JSON.parse(JSON.stringify(verified)));
      setSuccessMsg("Loadout updated! Restart game to see changes.");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e) {
      console.error("[Loadout] Save error:", e);
      setError(formatError(e, "Failed to save"));
    } finally {
      setSaving(false);
    }
  }, [pending, saving]);

  const resetLoadout = useCallback(() => {
    if (!loadout) return;
    setPending(JSON.parse(JSON.stringify(loadout)));
    setPicker(null);
  }, [loadout]);

  const toggleFavoriteSkin = useCallback((skinUuid) => {
    setFavoriteSkins((prev) => {
      const next = new Set(prev);
      const k = skinUuid.toLowerCase();
      if (next.has(k)) next.delete(k);
      else next.add(k);
      try {
        localStorage.setItem("favorite_skins", JSON.stringify([...next]));
      } catch (e) {
        console.warn("[Loadout] suppressed:", e);
      }
      return next;
    });
  }, []);

  const toggleFavoriteLevel = useCallback((levelUuid) => {
    setFavoriteLevels((prev) => {
      const next = new Set(prev);
      const k = levelUuid.toLowerCase();
      if (next.has(k)) next.delete(k);
      else next.add(k);
      try {
        localStorage.setItem("favorite_levels", JSON.stringify([...next]));
      } catch (e) {
        console.warn("[Loadout] suppressed:", e);
      }
      return next;
    });
  }, []);

  const randomizeWeapon = useCallback(
    (weapon) => {
      if (!weapon?.skins) return;
      const candidates = [];
      for (const skin of weapon.skins) {
        for (const lvl of skin.levels || []) {
          if (favoriteLevels.has(lvl.uuid.toLowerCase())) {
            candidates.push({ skin, level: lvl });
          }
        }
      }
      if (candidates.length === 0) {
        for (const skin of weapon.skins) {
          if (favoriteSkins.has(skin.uuid.toLowerCase())) {
            const lvl = skin.levels?.[skin.levels.length - 1] || skin.levels?.[0];
            if (lvl) candidates.push({ skin, level: lvl });
          }
        }
      }
      if (candidates.length === 0) return;
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      const chroma = pick.skin.chromas?.[0] || null;
      equipSkin(weapon.uuid, pick.skin, chroma, pick.level);
    },
    [favoriteSkins, favoriteLevels, equipSkin]
  );

  const randomizeAll = useCallback(() => {
    for (const w of weapons) randomizeWeapon(w);
  }, [weapons, randomizeWeapon]);

  const closePicker = () => {
    setPicker(null);
    setSearch("");
  };

  if (!connected) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <p className="text-text-muted text-sm">Connect to Valorant to manage your loadout</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="flex items-center gap-3 text-text-muted text-sm">
          <Spinner size={16} className="" />
          Loading loadout...
        </div>
      </div>
    );
  }

  const openPicker = (p) => {
    setPicker(p);
    setSearch("");
  };

  const renderPicker = () => {
    if (!picker) return null;

    if (picker.type === "weapon") {
      return (
        <SkinPicker
          weapon={picker.weapon}
          eq={getEquipped(picker.weapon.uuid)}
          search={search}
          onSearchChange={setSearch}
          onClose={closePicker}
          favoriteSkins={favoriteSkins}
          favoriteLevels={favoriteLevels}
          onToggleFavoriteSkin={toggleFavoriteSkin}
          onToggleFavoriteLevel={toggleFavoriteLevel}
          onEquip={equipSkin}
          onRandomize={randomizeWeapon}
        />
      );
    }

    if (picker.type === "spray") {
      const ownedList = sprays.filter(
        (s) => owned.sprays.has(s.uuid.toLowerCase()) || s.displayName === "Random Favorite Spray"
      );
      const eq = pending?.Sprays?.find((s) => s.EquipSlotID === picker.slot.id);
      return (
        <GridPicker
          items={ownedList}
          equippedId={eq?.SprayID}
          onSelect={(id) => equipSpray(picker.slot.id, id)}
          label={`${picker.slot.label} Spray`}
          search={search}
          onSearchChange={setSearch}
          onClose={closePicker}
          renderItem={(item) => (
            <Img
              src={item.displayIcon}
              className="w-14 h-14 object-contain"
              fallback={<div className="w-14 h-14 bg-base-600/50 rounded" />}
            />
          )}
        />
      );
    }

    if (picker.type === "card") {
      const ownedList = cards.filter((c) => owned.cards.has(c.uuid.toLowerCase()));
      return (
        <GridPicker
          items={ownedList}
          equippedId={pending?.Identity?.PlayerCardID}
          onSelect={equipCard}
          label="Player Cards"
          search={search}
          onSearchChange={setSearch}
          onClose={closePicker}
          renderItem={(item) => (
            <Img
              src={item.smallArt}
              className="w-12 h-16 object-cover rounded"
              fallback={<div className="w-12 h-16 bg-base-600/50 rounded" />}
            />
          )}
        />
      );
    }

    if (picker.type === "title") {
      const ownedList = titles.filter(
        (t) => owned.titles.has(t.uuid.toLowerCase()) || t.titleText === "" || !t.titleText
      );
      return (
        <GridPicker
          items={ownedList}
          equippedId={pending?.Identity?.PlayerTitleID}
          onSelect={equipTitle}
          label="Player Titles"
          search={search}
          onSearchChange={setSearch}
          onClose={closePicker}
          renderItem={(item) => (
            <div className="w-full h-8 flex items-center justify-center">
              <span className="text-[9px] text-text-primary text-center leading-tight px-1">
                {item.titleText || "None"}
              </span>
            </div>
          )}
        />
      );
    }
    return null;
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <LoadoutTab size={16} className="text-val-red" />
          <span className="text-sm font-display font-bold text-text-primary uppercase tracking-wide">
            Collection
          </span>
        </div>
        <div className="flex items-center gap-2">
          <AnimatePresence>
            {successMsg && (
              <motion.span
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="text-[10px] text-green-400"
              >
                {successMsg}
              </motion.span>
            )}
          </AnimatePresence>
          {error && (
            <span className="text-[10px] text-red-400 truncate max-w-[180px]">{error}</span>
          )}
          {(favoriteSkins.size > 0 || favoriteLevels.size > 0) && (
            <button
              onClick={randomizeAll}
              className="px-2 py-1 rounded text-[10px] font-display bg-base-600 hover:bg-base-500 text-text-secondary border border-border transition-colors"
              title="Roll a random favorite for every weapon"
            >
              🎲 Random All
            </button>
          )}
          {hasChanges && (
            <>
              <button
                onClick={resetLoadout}
                className="px-2 py-1 rounded text-[10px] font-display bg-base-600 hover:bg-base-500 text-text-secondary border border-border transition-colors"
              >
                Discard
              </button>
              <button
                onClick={saveLoadout}
                disabled={saving}
                className="px-2.5 py-1 rounded text-[10px] font-display font-bold bg-val-red/20 hover:bg-val-red/30 text-val-red border border-val-red/40 transition-colors disabled:opacity-50 uppercase tracking-wider"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </>
          )}
          <button
            onClick={fetchAll}
            className="p-1 rounded text-text-muted hover:text-text-primary transition-colors"
            title="Refresh"
          >
            <RefreshCcw size={13} />
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {picker ? (
          <motion.div
            key="picker"
            className="flex-1 flex flex-col min-h-0"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.12 }}
          >
            {renderPicker()}
          </motion.div>
        ) : (
          <motion.div
            key="grid"
            className="flex-1 overflow-y-auto custom-scroll"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
          >
            <div className="p-4 space-y-5">
              <PresetsPanel onApplied={handlePresetApplied} />

              <div className="space-y-2">
                <div className="text-[10px] font-display font-bold text-text-muted uppercase tracking-widest">
                  Identity
                </div>
                <IdentityCards
                  cardData={cards.find((c) => c.uuid === pending?.Identity?.PlayerCardID)}
                  titleData={titles.find((t) => t.uuid === pending?.Identity?.PlayerTitleID)}
                  onOpenCard={() => openPicker({ type: "card" })}
                  onOpenTitle={() => openPicker({ type: "title" })}
                />
              </div>

              <div className="space-y-2">
                <div className="text-[10px] font-display font-bold text-text-muted uppercase tracking-widest">
                  Sprays
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {SPRAY_SLOTS.map((slot) => {
                    const eq = pending?.Sprays?.find((s) => s.EquipSlotID === slot.id);
                    return (
                      <SprayCard
                        key={slot.id}
                        slot={slot}
                        sprayData={sprays.find((s) => s.uuid === eq?.SprayID)}
                        onOpen={() => openPicker({ type: "spray", slot })}
                      />
                    );
                  })}
                </div>
              </div>

              {weaponsByCategory.map(([cat, weaps]) => (
                <div key={cat} className="space-y-2">
                  <div className="text-[10px] font-display font-bold text-text-muted uppercase tracking-widest">
                    {CATEGORY_LABELS[cat] || cat}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {weaps.map((w) => (
                      <WeaponCard
                        key={w.uuid}
                        weapon={w}
                        eq={getEquipped(w.uuid)}
                        onOpen={() => openPicker({ type: "weapon", weapon: w })}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
