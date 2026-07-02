/**
 * Del 5: the full reasoning chain, narrated step by step. Every step is
 * attributable to a concrete fact/trace entry — nothing here infers
 * anything of its own; it only renders what deriveKnowledgeFacts()
 * (and the Fact Engine before it) already produced.
 * @returns {{step: string, detail: string}[]}
 */
export function buildCompletionPath({ observationText, activity, machineFact, kgTrace, missingSchema }) {
  const steps = [
    { step: "Observation", detail: observationText },
    { step: "Aktivitet", detail: activity ? activity.label : "(ikke identifisert)" },
    { step: "Maskin", detail: machineFact ? String(machineFact.value) : "(ikke identifisert)" },
  ];
  for (const t of kgTrace) steps.push({ step: "Organisasjonen sier", detail: t.to + " (via " + t.via + ")" });
  steps.push({ step: "Status", detail: missingSchema ? missingSchema + " mangler" : "Alt fullført" });
  steps.push({ step: "Prompt vises", detail: missingSchema ? "requireSchema:" + missingSchema : "(ingen)" });
  return steps;
}
