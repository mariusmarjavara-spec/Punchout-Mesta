import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { StorageError } from "@/hooks/use-motor-state";
import { StorageErrorOverlay } from "./storage-error-overlay";

function fakeMotor(overrides: Partial<NonNullable<typeof window.Motor>> = {}) {
  return {
    resetCurrentDayOnly: vi.fn(),
    tryIgnoreError: vi.fn(),
    ...overrides,
  } as unknown as NonNullable<typeof window.Motor>;
}

const rawError: StorageError = {
  type: "parse_error",
  message: "Kunne ikke lese aktiv dag: Unexpected token < in JSON at position 0",
};

describe("StorageErrorOverlay", () => {
  it("shows only the friendly message by default, not the raw technical error (Execution Sprint 3, Oppgave 6)", () => {
    // Regression anchor for the exact fix this component's own comment
    // describes: the raw JS error.message used to be shown directly and
    // scared the least-confident users.
    const motor = fakeMotor();
    render(<StorageErrorOverlay error={rawError} motor={motor} />);

    expect(screen.getByText("Lagringsfeil")).toBeInTheDocument();
    expect(
      screen.getByText(/Noe gikk galt med lagringen av dagens data/),
    ).toBeInTheDocument();
    expect(screen.queryByText(rawError.message)).not.toBeInTheDocument();
  });

  it("reveals the raw technical detail only after the user explicitly asks for it, and can hide it again", async () => {
    const motor = fakeMotor();
    const user = userEvent.setup();
    render(<StorageErrorOverlay error={rawError} motor={motor} />);

    await user.click(screen.getByRole("button", { name: /Vis detaljer/ }));
    expect(screen.getByText(rawError.message)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Skjul detaljer/ }));
    expect(screen.queryByText(rawError.message)).not.toBeInTheDocument();
  });

  it("resetCurrentDayOnly() is called when the user resets, never touching history", async () => {
    const motor = fakeMotor();
    const user = userEvent.setup();
    render(<StorageErrorOverlay error={rawError} motor={motor} />);

    expect(screen.getByText(/Historikk beholdes/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Nullstill dagens data" }));

    expect(motor.resetCurrentDayOnly).toHaveBeenCalledTimes(1);
    expect(motor.tryIgnoreError).not.toHaveBeenCalled();
  });

  it("tryIgnoreError() is called when the user chooses to ignore and continue", async () => {
    const motor = fakeMotor();
    const user = userEvent.setup();
    render(<StorageErrorOverlay error={rawError} motor={motor} />);

    await user.click(screen.getByRole("button", { name: "Ignorer og fortsett" }));

    expect(motor.tryIgnoreError).toHaveBeenCalledTimes(1);
    expect(motor.resetCurrentDayOnly).not.toHaveBeenCalled();
  });
});
