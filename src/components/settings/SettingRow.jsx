import { Toggle } from "../ui/Toggle";

// The recurring "title + description + toggle" row that fills the Startup,
// Misc, Debug and Theme cards.
export function SettingRow({ title, desc, enabled, onChange }) {
  return (
    <div className="flex items-center justify-between p-4">
      <div>
        <p className="text-sm font-display font-medium text-text-primary">{title}</p>
        <p className="text-xs font-body text-text-muted mt-0.5">{desc}</p>
      </div>
      <Toggle enabled={enabled} onChange={onChange} />
    </div>
  );
}
