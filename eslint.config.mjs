// Dogfooding Punchout audit finding #2: `npm run lint` (`"lint": "eslint ."`)
// has been non-functional since at least the project's current dependency
// state — `eslint` was not a declared dependency and no config file existed
// for it to use even if it had been. CI never ran a lint step, so this went
// unnoticed. This is Next.js's own standard flat-config preset
// (`eslint-config-next`, pinned to the exact Next version already in use,
// 16.0.10) — no custom rules invented, matching the "smallest solution"
// discipline the rest of this codebase's own engineering history already
// applies to itself.
import nextPlugin from "eslint-config-next";

const config = [
  ...nextPlugin,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "public/motor.js",
      "lib/regression/**",
      "lib/adapters/dry-run.mjs",
    ],
  },
  {
    // Operation Punchout Soft Launch, Phase A lint triage: all 13 current
    // react-hooks/set-state-in-effect findings were reviewed individually
    // (app/page.tsx, app/ops/page.tsx, operations-phase.tsx,
    // start-day-phase.tsx, carousel.tsx, use-draft-text.ts, use-mobile.ts,
    // use-motor-state.ts) and are the same deliberate pattern: syncing React
    // state from an external, imperative source of truth on mount or on an
    // external-system event -- window.Motor (the frozen motor.js global,
    // whose own comments say "always read fresh from source"),
    // sessionStorage/localStorage, matchMedia, the Web Speech API, and an
    // embla-carousel instance. None involve derived state that could be
    // computed during render instead. Downgraded to "warn" (not disabled)
    // so it stays visible rather than silently suppressed, while not
    // blocking CI on an idiom this codebase uses correctly and pervasively.
    // Genuine correctness or purity findings (e.g. the Math.random-in-memo
    // fix in sidebar.tsx, same pass) were fixed, not suppressed.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];

export default config;
