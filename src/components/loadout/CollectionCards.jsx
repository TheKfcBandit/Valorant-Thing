import { RARITY_COLORS } from "../../utils/rarity";
import { findSkinByLevel, findChroma, getSkinImg } from "../../utils/loadout";
import { TypeMark } from "../../icons";
import { Img } from "./Img";

export function WeaponCard({ weapon, eq, onOpen }) {
  const skin = eq ? findSkinByLevel(weapon, eq.SkinLevelID) : null;
  const chroma = skin ? findChroma(skin, eq?.ChromaID) : null;
  const imgUrl = getSkinImg(skin, chroma) || weapon.displayIcon;
  const skinName = skin?.displayName?.replace(weapon.displayName, "").trim() || "Standard";
  const rarity = skin?.contentTierUuid;
  const rarityColor = rarity ? RARITY_COLORS[rarity] : null;

  return (
    <button
      onClick={onOpen}
      className="group relative bg-base-700/60 hover:bg-base-600/80 border border-border/50 hover:border-border rounded-lg overflow-hidden transition-all duration-150 flex flex-col"
    >
      {rarityColor && (
        <div
          className="absolute top-0 left-0 right-0 h-[2px]"
          style={{ backgroundColor: rarityColor }}
        />
      )}
      <div className="flex-1 flex items-center justify-center p-3 min-h-[70px]">
        <Img src={imgUrl} className="max-w-full max-h-[56px] object-contain drop-shadow-lg" />
      </div>
      <div className="px-2 pb-2 text-center">
        <div className="text-[10px] font-display font-bold text-text-primary uppercase tracking-wide truncate">
          {weapon.displayName}
        </div>
        <div
          className="text-[9px] text-text-muted truncate"
          style={rarityColor ? { color: rarityColor } : {}}
        >
          {skinName}
        </div>
      </div>
    </button>
  );
}

export function SprayCard({ slot, sprayData, onOpen }) {
  return (
    <button
      onClick={onOpen}
      className="bg-base-700/60 hover:bg-base-600/80 border border-border/50 hover:border-border rounded-lg overflow-hidden transition-all duration-150 flex flex-col"
    >
      <div className="flex-1 flex items-center justify-center p-2 min-h-[70px]">
        {sprayData?.displayIcon ? (
          <Img src={sprayData.displayIcon} className="max-w-full max-h-[56px] object-contain" />
        ) : (
          <div className="w-12 h-12 rounded bg-base-600/50" />
        )}
      </div>
      <div className="px-2 pb-2 text-center">
        <div className="text-[10px] font-display font-bold text-text-primary uppercase tracking-wide">
          {slot.label}
        </div>
        <div className="text-[9px] text-text-muted truncate">
          {sprayData?.displayName || "None"}
        </div>
      </div>
    </button>
  );
}

export function IdentityCards({ cardData, titleData, onOpenCard, onOpenTitle }) {
  return (
    <div className="flex gap-3">
      <button
        onClick={onOpenCard}
        className="flex items-center gap-3 bg-base-700/60 hover:bg-base-600/80 border border-border/50 hover:border-border rounded-lg p-2.5 transition-all flex-1 min-w-0"
      >
        {cardData?.smallArt ? (
          <Img src={cardData.smallArt} className="w-10 h-10 rounded object-cover flex-shrink-0" />
        ) : (
          <div className="w-10 h-10 rounded bg-base-600/50 flex-shrink-0" />
        )}
        <div className="text-left min-w-0">
          <div className="text-[9px] font-display text-text-muted uppercase tracking-wider">
            Player Card
          </div>
          <div className="text-xs text-text-primary truncate">
            {cardData?.displayName || "Default"}
          </div>
        </div>
      </button>
      <button
        onClick={onOpenTitle}
        className="flex items-center gap-3 bg-base-700/60 hover:bg-base-600/80 border border-border/50 hover:border-border rounded-lg p-2.5 transition-all flex-1 min-w-0"
      >
        <div className="w-10 h-10 rounded bg-base-600/50 flex-shrink-0 flex items-center justify-center">
          <TypeMark className="text-text-muted" />
        </div>
        <div className="text-left min-w-0">
          <div className="text-[9px] font-display text-text-muted uppercase tracking-wider">
            Title
          </div>
          <div className="text-xs text-text-primary truncate">{titleData?.titleText || "None"}</div>
        </div>
      </button>
    </div>
  );
}
