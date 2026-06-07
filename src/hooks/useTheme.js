import { useEffect, useState } from "react";
import { CUSTOM_VARS, DEFAULT_CUSTOM, deriveCustomVars } from "../themes";

// Owns the theme picker state. The named presets live in `src/themes.js`;
// "custom" runs the user's gradient through `deriveCustomVars` and writes
// the result onto `document.documentElement` as CSS custom properties.
//
// Returns the same `(state, setter)` pairs as the original inline
// declarations so the SettingsPage prop wiring doesn't change.
export function useTheme() {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("app_theme");
    if (!saved || saved === "default") return "crimson-moon";
    return saved;
  });
  const [simplifiedTheme, setSimplifiedTheme] = useState(
    () => localStorage.getItem("simplified_theme") === "true"
  );
  const [customTheme, setCustomTheme] = useState(() => {
    try {
      const s = localStorage.getItem("custom_theme");
      return s ? JSON.parse(s) : DEFAULT_CUSTOM;
    } catch {
      return DEFAULT_CUSTOM;
    }
  });
  const [disableAnimations, setDisableAnimations] = useState(
    () => localStorage.getItem("disable_animations") === "true"
  );

  useEffect(() => {
    document.documentElement.classList.toggle("no-animations", disableAnimations);
    localStorage.setItem("disable_animations", String(disableAnimations));
  }, [disableAnimations]);

  // Persistence symmetry with theme/customTheme/disableAnimations.
  // Without this, any caller that bypasses SettingsConnector's wrapper
  // setter loses the value on reload.
  useEffect(() => {
    localStorage.setItem("simplified_theme", String(simplifiedTheme));
  }, [simplifiedTheme]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("app_theme", theme);
    if (theme !== "custom") {
      CUSTOM_VARS.forEach((v) => document.documentElement.style.removeProperty(v));
    }
  }, [theme]);

  useEffect(() => {
    if (theme !== "custom") return;
    const vars = customTheme.vars || deriveCustomVars(customTheme);
    Object.entries(vars).forEach(([k, v]) => document.documentElement.style.setProperty(k, v));
    localStorage.setItem("custom_theme", JSON.stringify(customTheme));
  }, [theme, customTheme]);

  return {
    theme,
    setTheme,
    simplifiedTheme,
    setSimplifiedTheme,
    customTheme,
    setCustomTheme,
    disableAnimations,
    setDisableAnimations,
  };
}
