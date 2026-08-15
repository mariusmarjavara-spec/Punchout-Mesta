import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CrossTabConflictBanner } from "./cross-tab-conflict-banner";

describe("CrossTabConflictBanner", () => {
  it("shows the conflict warning and both real actions (Hotfix 1: varsling, not a new save/merge system)", () => {
    render(<CrossTabConflictBanner onDismiss={() => {}} />);
    expect(screen.getByText("Denne dagen er også åpen et annet sted")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Last inn på nytt" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Jeg fortsetter her likevel" })).toBeInTheDocument();
  });

  it("calls onDismiss when the user chooses to continue here anyway", async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    render(<CrossTabConflictBanner onDismiss={onDismiss} />);

    await user.click(screen.getByRole("button", { name: "Jeg fortsetter her likevel" }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("reloads the page (not a merge) when the user chooses to reload", async () => {
    const reload = vi.fn();
    // window.location.reload is non-configurable in jsdom by default;
    // replace the whole location object for this test only.
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, reload },
    });

    const user = userEvent.setup();
    render(<CrossTabConflictBanner onDismiss={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Last inn på nytt" }));

    expect(reload).toHaveBeenCalledTimes(1);

    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });
});
