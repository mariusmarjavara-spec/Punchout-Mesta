import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StaleDayBanner } from "./stale-day-banner";

function fakeMotor(overrides: Partial<NonNullable<typeof window.Motor>> = {}) {
  return {
    continueStaleDay: vi.fn(),
    endStaleDay: vi.fn(),
    discardStaleDay: vi.fn(),
    ...overrides,
  } as unknown as NonNullable<typeof window.Motor>;
}

describe("StaleDayBanner", () => {
  it("offers the 3 real actions by default, no silent dismiss (Execution Sprint 3, Oppgave 6)", () => {
    const motor = fakeMotor();
    render(<StaleDayBanner date="2026-08-10" motor={motor} />);

    expect(screen.getByText(/Du har ulagret data fra/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fortsett dagen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Avslutt dagen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Forkast" })).toBeInTheDocument();
    // The old "X" dismiss the report found (hid the banner, resolved nothing) must not exist.
    expect(screen.queryByRole("button", { name: "X" })).not.toBeInTheDocument();
  });

  it("continueStaleDay() is called when the user continues the day", async () => {
    const motor = fakeMotor();
    const user = userEvent.setup();
    render(<StaleDayBanner date="2026-08-10" motor={motor} />);

    await user.click(screen.getByRole("button", { name: "Fortsett dagen" }));

    expect(motor.continueStaleDay).toHaveBeenCalledTimes(1);
    expect(motor.endStaleDay).not.toHaveBeenCalled();
    expect(motor.discardStaleDay).not.toHaveBeenCalled();
  });

  it("endStaleDay() is called when the user ends the day", async () => {
    const motor = fakeMotor();
    const user = userEvent.setup();
    render(<StaleDayBanner date="2026-08-10" motor={motor} />);

    await user.click(screen.getByRole("button", { name: "Avslutt dagen" }));

    expect(motor.endStaleDay).toHaveBeenCalledTimes(1);
  });

  it("discard requires a real two-step confirmation, not one click", async () => {
    const motor = fakeMotor();
    const user = userEvent.setup();
    render(<StaleDayBanner date="2026-08-10" motor={motor} />);

    await user.click(screen.getByRole("button", { name: "Forkast" }));

    // Clicking "Forkast" alone must NOT discard anything yet — it must
    // reveal the confirmation step first.
    expect(motor.discardStaleDay).not.toHaveBeenCalled();
    expect(screen.getByText(/Forkast data fra/)).toBeInTheDocument();
    expect(screen.getByText("All data fra denne dagen vil gå tapt. Dette kan ikke angres.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ja, forkast" }));
    expect(motor.discardStaleDay).toHaveBeenCalledTimes(1);
  });

  it("cancelling the discard confirmation returns to the default 3-action view without discarding", async () => {
    const motor = fakeMotor();
    const user = userEvent.setup();
    render(<StaleDayBanner date="2026-08-10" motor={motor} />);

    await user.click(screen.getByRole("button", { name: "Forkast" }));
    await user.click(screen.getByRole("button", { name: "Avbryt" }));

    expect(motor.discardStaleDay).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Fortsett dagen" })).toBeInTheDocument();
  });

  it("never throws on an unparseable date string (renders 'Invalid Date' rather than crashing)", () => {
    // The component's own try/catch around toLocaleDateString() suggests the
    // intent was "fall back to the raw date string on failure" — but
    // new Date(x).toLocaleDateString() never actually throws for a bad
    // string, it just formats to the literal text "Invalid Date", so the
    // catch branch is effectively unreachable for this input shape. The
    // real, verified behavior (never crashing) is what this test protects.
    const motor = fakeMotor();
    render(<StaleDayBanner date="not-a-real-date" motor={motor} />);

    expect(screen.getByText(/Du har ulagret data fra/)).toBeInTheDocument();
  });
});
