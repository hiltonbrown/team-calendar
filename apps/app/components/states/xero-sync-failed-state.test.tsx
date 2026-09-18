import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { XeroSyncFailedState } from "./xero-sync-failed-state";

describe("XeroSyncFailedState", () => {
  afterEach(() => {
    cleanup();
  });
  it("renders correctly with message", () => {
    render(<XeroSyncFailedState message="The API key is invalid." />);

    expect(screen.getByRole("alert")).toBeDefined();
    expect(screen.getByText("Xero sync failed")).toBeDefined();
    expect(screen.getByText("The API key is invalid.")).toBeDefined();
  });

  it("renders with action slots", () => {
    render(
      <XeroSyncFailedState
        message="Failed"
        retrySlot={<button type="button">Retry</button>}
        revertSlot={<button type="button">Revert</button>}
      />
    );

    expect(screen.getByRole("button", { name: "Retry" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Revert" })).toBeDefined();
  });

  it.each([
    ["approve", "Approval failed", "Approval failed in Xero: Timed out."],
    ["decline", "Decline failed", "Decline failed in Xero: Timed out."],
  ] as const)(
    "uses recovery copy for a failed %s action",
    (action, badge, copy) => {
      render(
        <XeroSyncFailedState failedAction={action} message="Timed out." />
      );

      expect(screen.getByText(badge)).toBeDefined();
      expect(screen.getByText(copy)).toBeDefined();
    }
  );
});
