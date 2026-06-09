import { RARITY_COLORS } from "../../utils/rarity";
import { findChroma, getAllSkins, getSkinImg } from "../../utils/loadout";
import { ArrowLeft, CheckBadge, HeartToggle } from "../../icons";
import { Img } from "./Img";

export function SkinPicker({
  weapon,
  eq,
  search,
  onSearchChange,
  onClose,
  favoriteSkins,
  favoriteLevels,
  onToggleFavoriteSkin,
  onToggleFavoriteLevel,
  onEquip,
  onRandomize,
}) {
  const ownedSkins = getAllSkins(weapon);
  const q = search.toLowerCase();
  const filtered = q
    ? ownedSkins.filter((s) => s.displayName.toLowerCase().includes(q))
    : ownedSkins;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-4 py-3 border-b border-border flex items-center gap-3">
        <button
          onClick={onClose}
          className="text-text-muted hover:text-text-primary transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <div className="text-sm font-display font-bold text-text-primary uppercase tracking-wide">
            {weapon.displayName}
          </div>
          <div className="text-[10px] text-text-muted">{filtered.length} skins</div>
        </div>
        <button
          onClick={() => onRandomize(weapon)}
          className="px-2 py-1 rounded text-[10px] font-display font-semibold bg-base-600 hover:bg-base-500 border border-border text-text-secondary transition-colors"
          title="Random from your favorites for this weapon"
        >
          Random Favorite
        </button>
      </div>
      <div className="px-4 py-2">
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search skins..."
          autoFocus
          className="w-full bg-base-700 border border-border rounded px-3 py-1.5 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-text-muted/50"
        />
      </div>
      <div className="flex-1 overflow-y-auto custom-scroll px-4 pb-4 space-y-1.5">
        {filtered.map((skin) => {
          const isEquipped = eq?.SkinID?.toLowerCase() === skin.uuid.toLowerCase();
          const ownedChroms = skin.chromas || [];
          const ownedLvls = skin.levels || [];
          const topLevel = ownedLvls[ownedLvls.length - 1] || skin.levels?.[0];
          const rarity = skin.contentTierUuid;
          const rarityColor = rarity ? RARITY_COLORS[rarity] : null;

          const skinFav = favoriteSkins.has(skin.uuid.toLowerCase());

          return (
            <div
              key={skin.uuid}
              className={`rounded-lg border overflow-hidden transition-colors ${isEquipped ? "border-val-red/60 bg-val-red/5" : "border-border/50 bg-base-700/40 hover:bg-base-600/60"}`}
            >
              <div className="w-full p-3 flex items-center gap-4">
                <button
                  onClick={() => onEquip(weapon.uuid, skin, ownedChroms[0], topLevel)}
                  className="flex items-center gap-4 flex-1 min-w-0"
                >
                  <div className="w-28 h-14 flex-shrink-0 flex items-center justify-center">
                    <Img
                      src={getSkinImg(skin, null)}
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                  <div className="text-left min-w-0 flex-1">
                    <div className="text-xs font-display font-semibold text-text-primary">
                      {skin.displayName}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {rarityColor && (
                        <div
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: rarityColor }}
                        />
                      )}
                      <span className="text-[10px] text-text-muted">
                        {ownedLvls.length} level{ownedLvls.length !== 1 ? "s" : ""} ·{" "}
                        {ownedChroms.length} variant{ownedChroms.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavoriteSkin(skin.uuid);
                  }}
                  className="p-1.5 rounded hover:bg-base-500/40 transition-colors flex-shrink-0"
                  title={skinFav ? "Unfavorite" : "Favorite"}
                >
                  <HeartToggle
                    filled={skinFav}
                    style={{ color: skinFav ? "rgb(var(--val-red))" : "rgb(var(--text-muted))" }}
                  />
                </button>
                {isEquipped && <CheckBadge className="text-val-red flex-shrink-0" />}
              </div>
              {isEquipped && ownedChroms.length > 1 && (
                <div className="px-3 pb-2.5 pt-0.5 flex gap-1.5 flex-wrap border-t border-border/30">
                  <span className="text-[9px] text-text-muted mr-1 self-center">Variants:</span>
                  {ownedChroms.map((ch) => {
                    const isCur = eq?.ChromaID?.toLowerCase() === ch.uuid.toLowerCase();
                    return (
                      <button
                        key={ch.uuid}
                        onClick={() => onEquip(weapon.uuid, skin, ch, topLevel)}
                        className={`rounded border transition-colors ${isCur ? "border-val-red ring-1 ring-val-red/30" : "border-border/50 hover:border-text-muted/40"}`}
                        title={ch.displayName}
                      >
                        {ch.swatch ? (
                          <img src={ch.swatch} alt="" className="w-6 h-6 rounded" />
                        ) : (
                          <div className="w-6 h-6 rounded bg-base-500 text-[8px] text-text-muted flex items-center justify-center">
                            {ownedChroms.indexOf(ch) + 1}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              {isEquipped && ownedLvls.length > 1 && (
                <div className="px-3 pb-2.5 pt-0.5 flex gap-1 flex-wrap border-t border-border/30">
                  <span className="text-[9px] text-text-muted mr-1 self-center">Level:</span>
                  {ownedLvls.map((lvl, idx) => {
                    const isCur = eq?.SkinLevelID?.toLowerCase() === lvl.uuid.toLowerCase();
                    const lvlFav = favoriteLevels.has(lvl.uuid.toLowerCase());
                    return (
                      <div key={lvl.uuid} className="flex items-center">
                        <button
                          onClick={() =>
                            onEquip(weapon.uuid, skin, findChroma(skin, eq.ChromaID), lvl)
                          }
                          className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${isCur ? "border-val-red text-val-red bg-val-red/10" : "border-border/50 text-text-muted hover:border-text-muted/40"}`}
                        >
                          {idx + 1}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleFavoriteLevel(lvl.uuid);
                          }}
                          className="ml-0.5 p-0.5 rounded hover:bg-base-500/40 transition-colors"
                          title={lvlFav ? "Unfavorite this level" : "Favorite this level"}
                        >
                          <HeartToggle
                            size={9}
                            filled={lvlFav}
                            strokeWidth="2.5"
                            style={{
                              color: lvlFav ? "rgb(var(--val-red))" : "rgb(var(--text-muted))",
                            }}
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
