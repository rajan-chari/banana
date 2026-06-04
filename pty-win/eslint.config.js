// Minimal, curated eslint config. Per rubber-duck guidance, this is NOT a "broad
// rule dump". Each rule earns its place by catching a class of bug that TS can't,
// OR by surfacing refactor candidates we want to see (complexity, file size).
//
// Run: npm run lint (warnings allowed, errors fail)

import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // Ignore generated and vendored files.
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "public/lib/state.js", // typedef-only file, low signal from rules
    ],
  },

  // Baseline JS rules for all files.
  js.configs.recommended,

  // TypeScript files: server (src/) + tests + config.
  {
    files: ["src/**/*.ts", "test/**/*.ts"],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      parserOptions: { sourceType: "module", ecmaVersion: 2022 },
      globals: {
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        setImmediate: "readonly",
        queueMicrotask: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        global: "readonly",
        URL: "readonly",
        fetch: "readonly",
        AbortController: "readonly",
        AbortSignal: "readonly",
      },
    },
    rules: {
      // TS already handles unused vars more accurately; turn off the base.
      "no-unused-vars": "off",
      // Allow `_` prefix as intentional-unused convention.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      // We use `any` deliberately in a few places (JSON parse boundaries, etc.).
      "@typescript-eslint/no-explicit-any": "off",
      // require()s in TS appear in CJS interop; tolerate.
      "@typescript-eslint/no-require-imports": "off",
      // Empty catches are deliberate "best-effort" patterns in folders.ts/log.ts.
      "no-empty": ["error", { allowEmptyCatch: true }],
      // Same useless-assignment exception as the public side.
      "no-useless-assignment": "off",
    },
  },

  // Node build scripts (scripts/*.mjs).
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      parserOptions: { sourceType: "module", ecmaVersion: 2022 },
      globals: {
        process: "readonly",
        console: "readonly",
      },
    },
  },

  // Browser JS: public/app.js + public/lib/*.js.
  {
    files: ["public/**/*.js"],
    languageOptions: {
      parserOptions: { sourceType: "module", ecmaVersion: 2022 },
      globals: {
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        location: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        console: "readonly",
        fetch: "readonly",
        WebSocket: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        Event: "readonly",
        CustomEvent: "readonly",
        KeyboardEvent: "readonly",
        MouseEvent: "readonly",
        PointerEvent: "readonly",
        FocusEvent: "readonly",
        HTMLElement: "readonly",
        HTMLInputElement: "readonly",
        HTMLSelectElement: "readonly",
        HTMLButtonElement: "readonly",
        HTMLTableRowElement: "readonly",
        HTMLCanvasElement: "readonly",
        Node: "readonly",
        Element: "readonly",
        DOMParser: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        queueMicrotask: "readonly",
        AbortController: "readonly",
        ResizeObserver: "readonly",
        MutationObserver: "readonly",
        crypto: "readonly",
        performance: "readonly",
        alert: "readonly",
        confirm: "readonly",
        prompt: "readonly",
        getComputedStyle: "readonly",
        CSS: "readonly",
        // CDN-loaded xterm globals
        Terminal: "readonly",
        FitAddon: "readonly",
      },
    },
    rules: {
      "no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      // app.js uses module-pattern with many internal helpers; tolerate.
      "no-empty": ["warn", { allowEmptyCatch: true }],
      // `let what = ""` defaults before exhaustive if/else are a tolerated pattern.
      "no-useless-assignment": "off",
    },
  },

  // Universal curated rules. These are the actual "earn their keep" picks.
  {
    files: ["src/**/*.ts", "public/**/*.js", "test/**/*.ts"],
    rules: {
      // Surface refactor candidates. Threshold is the campaign ratchet: set
      // to "where we are today" as an ERROR so pre-push gates regression.
      // Lower each value as functions are reduced. Update both here and in
      // the campaign briefing when ratcheting.
      complexity: ["error", { max: 16 }],

      // Mega-function ceiling — same ratchet pattern as complexity above.
      // Current top offenders: initSettingsModal 107, createWsRuntime 102,
      // startServer 100, registerInspectionRoutes 78, showQuickMessageInput 70
      // (counts use skipBlankLines + skipComments).
      // IIFEs excluded because they're init-time scaffolding that captures
      // private state in a closure — forcing decomposition would just move
      // that state to module scope (loss of encapsulation, not a real
      // improvement).
      "max-lines-per-function": [
        "error",
        { max: 107, skipBlankLines: true, skipComments: true, IIFEs: false },
      ],

      // TS's noFallthroughCasesInSwitch covers the bug case; eslint version is
      // a defense in depth + flags non-TS files.
      "no-fallthrough": "error",

      // Real bug class: `if (x = 1)` typos, but `while ((m = re.exec(...)))` is idiomatic.
      "no-cond-assign": ["error", "except-parens"],

      // Common foot-gun: `for (var i ...)` capturing in closures.
      "no-var": "error",
      "prefer-const": ["warn", { destructuring: "all" }],
    },
  },

  // Test-file overrides — describe/it callbacks are inherent scaffolding,
  // not real functions worth size-limiting.
  {
    files: ["test/**/*.ts"],
    rules: {
      "max-lines-per-function": "off",
    },
  },
);
