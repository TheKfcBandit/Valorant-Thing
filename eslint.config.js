import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

// Conservative ruleset. Picks: things that catch real bugs, not style fights.
// Style is prettier's job; semantic issues are eslint's.
export default [
  {
    ignores: ["dist/**", "node_modules/**", "src-tauri/**", "public/**"],
  },
  js.configs.recommended,
  {
    files: ["**/*.{js,jsx,mjs}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // React: rules-of-hooks catches real bugs. exhaustive-deps off until
      // Phase 5 — existing code intentionally diverges in places.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "off",

      // Bare catch is the philosophy-rule-4 violation. Empty blocks elsewhere
      // (try/finally, empty function bodies) are still allowed.
      "no-empty": ["error", { allowEmptyCatch: false }],

      // Unused variables waste reading time. Allow `_` prefix for intentional.
      "no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],

      // Existing-code noise reduction.
      "no-useless-escape": "warn",
      "no-prototype-builtins": "warn",
      "no-constant-binary-expression": "warn",
    },
  },
];
