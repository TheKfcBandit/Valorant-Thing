import { ArrowLeft } from "../../icons";

export function GridPicker({
  items,
  equippedId,
  onSelect,
  label,
  renderItem,
  search,
  onSearchChange,
  onClose,
}) {
  const q = search.toLowerCase();
  const filtered = q
    ? items.filter((i) => (i.displayName || i.titleText || "").toLowerCase().includes(q))
    : items;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-4 py-3 border-b border-border flex items-center gap-3">
        <button
          onClick={onClose}
          className="text-text-muted hover:text-text-primary transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <div className="text-sm font-display font-bold text-text-primary uppercase tracking-wide">
            {label}
          </div>
          <div className="text-[10px] text-text-muted">{filtered.length} items</div>
        </div>
      </div>
      <div className="px-4 py-2">
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={`Search ${label.toLowerCase()}...`}
          autoFocus
          className="w-full bg-base-700 border border-border rounded px-3 py-1.5 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-text-muted/50"
        />
      </div>
      <div className="flex-1 overflow-y-auto custom-scroll px-4 pb-4">
        <div
          className={`grid gap-2 ${label === "Player Cards" ? "grid-cols-5" : label === "Player Titles" ? "grid-cols-3" : "grid-cols-5"}`}
        >
          {filtered.map((item) => {
            const isEq = equippedId?.toLowerCase() === item.uuid.toLowerCase();
            return (
              <button
                key={item.uuid}
                onClick={() => onSelect(item.uuid)}
                className={`rounded-lg border p-1.5 flex flex-col items-center gap-1 transition-colors ${isEq ? "border-val-red bg-val-red/5" : "border-border/50 bg-base-700/40 hover:bg-base-600/60"}`}
                title={item.displayName || item.titleText || ""}
              >
                {renderItem(item)}
                <div className="text-[8px] text-text-muted text-center truncate w-full leading-tight">
                  {item.displayName || item.titleText || "None"}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
