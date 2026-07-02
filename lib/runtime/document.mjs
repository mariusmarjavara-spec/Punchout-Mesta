/**
 * Phase 4: Runtime Explainability. generateRuntimeDocumentation() is a
 * pure function of an OrganizationRuntime — there is nowhere to
 * hand-edit this output, so it can never drift from what the Runtime
 * actually contains. Walks Activity -> MachineTypes -> RequiredSchemas
 * -> Rules -> Capabilities, and includes one worked example per
 * machine type so a reader sees the actual reasoning chain, not just a
 * schema listing.
 * @param {import('./types.mjs').OrganizationRuntime} runtime
 * @returns {string} Markdown
 */
export function generateRuntimeDocumentation(runtime) {
  const lines = [];
  const p = (s = "") => lines.push(s);

  p(`# ${runtime.organizationId} — Runtime v${runtime.runtimeVersion}`);
  p(`Compiled ${runtime.compiledAt} · checksum ${runtime.checksum}`);
  p();
  p("## Activities → Machine Types → Required Schemas");
  for (const activity of runtime.knowledgeGraph.activities) {
    p(`### ${activity.label} (\`${activity.id}\`)`);
    if (activity.keywords?.length) p(`Detected by keywords: ${activity.keywords.join(", ")}`);
    for (const mtId of activity.machineTypes) {
      const mt = runtime.knowledgeGraph.machineTypes.find((m) => m.id === mtId);
      if (!mt) { p(`- ⚠ references unknown machine type "${mtId}"`); continue; }
      const req = mt.requiredSchemas.length ? mt.requiredSchemas.join(", ") : "(none)";
      p(`- **${mt.label}** requires: ${req}`);
    }
    p();
  }

  p("## Schemas");
  for (const s of runtime.schemas) {
    const locked = Object.entries(s.fields).filter(([, f]) => f.autofillable === false).map(([k]) => k);
    p(`- **${s.title || s.schemaType}** (\`${s.schemaType}\` v${s.version}) — ${Object.keys(s.fields).length} fields${locked.length ? `, locked from autofill: ${locked.join(", ")}` : ""}`);
  }
  p();

  p("## Rules (data, priority-ordered)");
  for (const r of [...runtime.rules].sort((a, b) => b.priority - a.priority)) {
    p(`- \`${r.id}\` (priority ${r.priority}): on **${r.trigger.event}**${r.trigger.factKey ? `(${r.trigger.factKey})` : ""} → **${r.action.type}** \`${r.action.target}\``);
  }
  p();

  p("## Capabilities");
  for (const c of runtime.capabilities) p(`- **${c.capability}** delivered by \`${c.providerId}\``);
  p();

  if (runtime.aliases.length) {
    p("## Aliases");
    for (const a of runtime.aliases) p(`- \`${a.externalKey}\` (${a.system}) → \`${a.canonicalKey}\``);
    p();
  }

  p("## Worked example");
  const exampleMachine = runtime.knowledgeGraph.machineTypes[0];
  if (exampleMachine) {
    const activity = runtime.knowledgeGraph.activities.find((a) => a.machineTypes.includes(exampleMachine.id));
    p(`Observation mentions **${exampleMachine.label}**${activity ? ` during **${activity.label}**` : ""}.`);
    p(`→ Organization says: requires ${exampleMachine.requiredSchemas.join(", ") || "(nothing)"}.`);
    p(`→ Completion Engine shows: ${exampleMachine.requiredSchemas.map((s) => runtime.promptLabels[s] || s).join("; ") || "(nothing missing)"}.`);
  }

  return lines.join("\n");
}
