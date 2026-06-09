// On/off switch. Consolidates the three near-identical local Toggles that
// lived in SettingsPage, FakeStatusPage and MiscPage (superset: the
// FakeStatusPage variant's disabled handling).
export function Toggle({ enabled, onChange, disabled = false, className = "", ...rest }) {
  return (
    <button
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className={`relative w-9 h-5 rounded-full transition-colors duration-200 shrink-0 ${
        disabled
          ? "bg-base-500 opacity-50 cursor-not-allowed"
          : enabled
            ? "bg-val-red"
            : "bg-base-500"
      } ${className}`}
      {...rest}
    >
      <div
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
          !disabled && enabled ? "translate-x-[18px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
