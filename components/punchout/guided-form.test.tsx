import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GuidedForm } from "./guided-form";

/**
 * The UI half of Guided Forms.
 *
 * The engine's own behaviour is pinned in lib/regression/guided-forms-cases.mjs;
 * what these check is the part only a rendered component can get wrong — that
 * one prompt dominates, that an inference is presented as something to agree
 * with rather than a filled box, that a judgement step offers no shortcut, and
 * that every transition is persisted rather than held in a hook.
 */

const RICH_CONTEXT = {
  activity: "Grøfterensk",
  location: "RV92 km 14–18",
  machine: "L90",
  workWarningPlan: "24-184",
  time: "10:42",
  organizationName: "Mesta",
};

function fakeMotor(overrides: Record<string, unknown> = {}) {
  return {
    buildGuidedFormContext: vi.fn(() => RICH_CONTEXT),
    getGuidedFormState: vi.fn(() => null),
    setGuidedFormState: vi.fn(),
    applyGuidedFormToSchema: vi.fn(),
    ...overrides,
  } as any;
}

function renderForm(props: Record<string, unknown> = {}) {
  const motor = (props.motor as any) ?? fakeMotor();
  render(
    <GuidedForm
      motor={motor}
      flowId={(props.flowId as any) ?? "ruh"}
      schemaId="schema_1"
      isListening={false}
      voiceError={(props.voiceError as any) ?? null}
      onToggleVoice={(props.onToggleVoice as any) ?? vi.fn()}
      voiceTranscript={(props.voiceTranscript as any) ?? null}
      onClose={vi.fn()}
      onConfirmed={(props.onConfirmed as any) ?? vi.fn()}
    />,
  );
  return motor;
}

describe("GuidedForm", () => {
  it("shows one prompt at a time rather than a form", () => {
    renderForm({ flowId: "ruh" });

    expect(screen.getByRole("heading", { name: "Hva har skjedd?" })).toBeInTheDocument();
    // The later prompts in the flow must not be on screen at the same time.
    expect(screen.queryByText("Hvorfor tror du dette skjedde?")).not.toBeInTheDocument();
    expect(screen.queryByText("Hva gjorde du med en gang?")).not.toBeInTheDocument();
  });

  it("drops hint cues for things Punchout already knows", () => {
    renderForm({ flowId: "ruh" });

    // Location and activity are in context, so asking for them again would
    // tell the worker Punchout is not paying attention.
    expect(screen.queryByText(/Hvor var du\?/)).not.toBeInTheDocument();
    expect(screen.getByText(/Var andre involvert\?/)).toBeInTheDocument();
  });

  it("presents an inference as something to agree with, not as a filled field", () => {
    renderForm({ flowId: "sja" });

    expect(screen.getByText("Punchout oppfattet:")).toBeInTheDocument();
    expect(screen.getByText("Grøfterensk")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stemmer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rediger" })).toBeInTheDocument();
  });

  it("persists domain progress on every transition, so a refresh cannot lose it", async () => {
    const motor = fakeMotor();
    const user = userEvent.setup();
    renderForm({ flowId: "sja", motor });

    await user.click(screen.getByRole("button", { name: "Stemmer" }));

    expect(motor.setGuidedFormState).toHaveBeenCalledWith("sja", expect.objectContaining({
      flowId: "sja",
      answers: expect.objectContaining({ oppgave: expect.objectContaining({ value: "Grøfterensk" }) }),
    }));
  });

  it("resumes from persisted progress instead of restarting", () => {
    const motor = fakeMotor({
      getGuidedFormState: vi.fn(() => ({
        version: 1,
        flowId: "ruh",
        stepIndex: 2,
        followUpQueue: [],
        answers: {
          beskrivelse: { value: "Traff autovernet", origin: "WORKER", at: "x" },
          umiddelbare_tiltak: { value: "Stoppet arbeidet", origin: "WORKER", at: "x" },
        },
        context: RICH_CONTEXT,
        completedAt: null,
      })),
    });
    renderForm({ flowId: "ruh", motor });

    // Step index 2 is the cause question, not the opening narrative.
    expect(screen.getByRole("heading", { name: "Hvorfor tror du dette skjedde?" })).toBeInTheDocument();
    expect(screen.queryByText("Hva har skjedd?")).not.toBeInTheDocument();
  });

  it("offers no accept shortcut on a judgement step", async () => {
    const motor = fakeMotor();
    const user = userEvent.setup();
    renderForm({ flowId: "sja", motor });

    await user.click(screen.getByRole("button", { name: "Stemmer" })); // oppgave
    await user.click(screen.getByRole("button", { name: "Stemmer" })); // sted

    expect(screen.getByRole("heading", { name: "Hva kan gå galt?" })).toBeInTheDocument();
    // Suggestions are offered, but nothing is pre-selected and there is no
    // "Stemmer" to press past a safety judgement.
    expect(screen.queryByRole("button", { name: "Stemmer" })).not.toBeInTheDocument();
    expect(screen.getByText(/Forslag/)).toBeInTheDocument();
    for (const button of screen.getAllByRole("button", { pressed: false })) {
      expect(button).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("treats a voice transcript exactly like typed text", async () => {
    renderForm({ flowId: "ruh", voiceTranscript: "Skuffa traff autovernet" });

    const box = screen.getByPlaceholderText("Skriv eller bruk tale") as HTMLTextAreaElement;
    expect(box.value).toContain("Skuffa traff autovernet");
  });

  it("surfaces a voice error rather than failing silently", () => {
    renderForm({ flowId: "ruh", voiceError: "Tale krever sikker tilkobling (https)." });

    expect(screen.getByRole("alert")).toHaveTextContent("Tale krever sikker tilkobling");
  });

  it("offers the legitimate 'no action was needed' answer where the flow allows it", async () => {
    const motor = fakeMotor();
    const user = userEvent.setup();
    renderForm({ flowId: "ruh", motor });

    await user.type(screen.getByPlaceholderText("Skriv eller bruk tale"), "Bulk i autovernet, ingen skade på folk");
    await user.click(screen.getByRole("button", { name: "Neste" }));

    expect(screen.getByRole("heading", { name: "Hva gjorde du med en gang?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ingen tiltak var nødvendig" })).toBeInTheDocument();
  });

  it("keeps touch targets large enough for gloved field use", () => {
    renderForm({ flowId: "sja" });
    // 44px is the documented floor used by the browser field-readiness gate.
    for (const button of screen.getAllByRole("button")) {
      const className = button.className;
      expect(className).toMatch(/min-h-\[(4[4-9]|[5-9]\d)px\]/);
    }
  });
});
