import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import react from "eslint-plugin-react";
import globals from "globals";

// Conservative ruleset. Picks: things that catch real bugs, not style fights.
// Style is prettier's job; semantic issues are eslint's.
//
// Structural rules (max-lines, restricted-imports, restricted-syntax) were
// added with the Leash & Purge plan — see ARCHITECTURE.md. They start at `warn`
// for rules that have existing violations (cleanup is staged, not big-bang)
// and at `error` for rules that have zero violations now.
export default [
  {
    ignores: ["dist/**", "node_modules/**", "src-tauri/**", "public/**"],
  },
  js.configs.recommended,
  {
    files: ["**/*.{js,jsx,mjs}"],
    plugins: { "react-hooks": reactHooks, react },
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

      // Without this, no-unused-vars can't see JSX references and flags every
      // component/import used only in markup (e.g. <TitleBar/>, <motion.div>).
      "react/jsx-uses-vars": "error",

      // Bare catch is the philosophy-rule-4 violation. Empty blocks elsewhere
      // (try/finally, empty function bodies) are still allowed.
      "no-empty": ["error", { allowEmptyCatch: false }],

      // Unused variables waste reading time. Allow `_` prefix for intentional.
      "no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],

      // Existing-code noise reduction.
      "no-useless-escape": "warn",
      "no-prototype-builtins": "warn",
      "no-constant-binary-expression": "warn",

      // Structural budget. Files past the ceiling are decomposed before
      // gaining new features. Warn-level until the page decomposition
      // sweep completes, then flip to error.
      "max-lines": ["warn", { max: 500, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": [
        "warn",
        { max: 200, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],
      complexity: ["warn", { max: 20 }],
    },
  },

  // Inline SVG ban: every <svg> literal belongs in src/icons/. Pages and
  // primitives import named icon components.
  // Dynamic data-viz SVGs (sparklines, generated paths) are legitimately
  // out of scope — add an eslint-disable-next-line on the specific element
  // and explain why in a trailing comment.
  {
    files: ["src/**/*.{js,jsx}"],
    ignores: ["src/icons/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXElement[openingElement.name.name='svg']",
          message:
            "Inline <svg> is not allowed outside src/icons/. Add the icon as a function component in src/icons/<Name>.jsx, re-export from src/icons/index.js, and import it here.",
        },
      ],
    },
  },

  // Pages must not import other pages. App.jsx is the only place that
  // imports pages; cross-page imports indicate a missing primitive in
  // src/components/ui/ or a sub-component that should be lifted out.
  //
  // LivePage.jsx is exempt because it is a tab router, not a content
  // page — it stitches MatchInfoPage and PartyPage under one sidebar
  // slot with a pill switcher. When App.jsx absorbs page-routing
  // responsibility in Phase 3, this router moves with it and the
  // carve-out can come out.
  {
    files: ["src/components/*Page.jsx"],
    ignores: ["src/components/LivePage.jsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["./*Page", "./*Page.jsx", "../components/*Page", "../components/*Page.jsx"],
              message:
                "Pages must not import other pages. Lift shared state to App.jsx, or extract a primitive into src/components/ui/ and import that from both pages.",
            },
          ],
        },
      ],
    },
  },
];
