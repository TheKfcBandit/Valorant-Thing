import { NoEntry } from "../../icons";

// "None" sentinel tile in the per-map agent grid. Picking this for a
// map disables instalock for that map specifically — useful when the
// user wants the default to apply everywhere except a few maps.
export default function NoneButton({ selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`group flex flex-col items-center gap-1 p-1.5 rounded-lg border transition-all duration-150 ${
        selected ? "bg-base-500/30 border-text-muted/40" : "border-transparent hover:bg-base-600/50"
      }`}
    >
      <div className="w-14 h-14 rounded-md bg-base-600 flex items-center justify-center">
        <NoEntry size={20} className="text-text-muted/50" />
      </div>
      <span
        className={`text-[11px] font-body leading-tight ${
          selected
            ? "text-text-primary font-medium"
            : "text-text-muted group-hover:text-text-secondary"
        }`}
      >
        None
      </span>
    </button>
  );
}
