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
];

export default config;
