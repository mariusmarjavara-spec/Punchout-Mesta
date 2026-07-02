import { checkEmptyRuntime, checkMalformedRuntime, checkLargeVolume, checkRefreshMidSchemaEdit } from "./robustness-checks.mjs";

function section(t) { console.log("\n=== " + t + " ==="); }

section("Empty Runtime");
console.log(await checkEmptyRuntime());

section("Malformed Runtime shapes");
for (const r of await checkMalformedRuntime()) console.log(r);

section("Large volume (50 machine types, 200 orders, 100 entries)");
console.log(await checkLargeVolume());

section("Refresh mid schema-edit (fresh vm context, same localStorage)");
console.log(await checkRefreshMidSchemaEdit());

process.exit(0);
