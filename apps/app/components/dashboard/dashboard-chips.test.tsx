import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ProvenanceChip, StatusChip } from "./dashboard-chips";

describe("dashboard chips", () => {
  afterEach(cleanup);

  it.each([
    ["submitted", "Pending", true],
    ["approved", "Approved", true],
    ["declined", "Declined", true],
    ["withdrawn", "Withdrawn", false],
  ])("labels %s status as %s", (status, label, hasIcon) => {
    render(<StatusChip status={status} />);
    const chip = screen.getByText(label);
    expect(chip.querySelector("svg") !== null).toBe(hasIcon);
  });

  it.each([
    ["xero_leave", "Synced from Xero", "ring-secondary-foreground/30"],
    ["team_calendar_leave", "Leave request", "ring-on-accent-container/30"],
    ["manual", "Manual entry", "ring-on-accent-container/30"],
  ])(
    "labels %s provenance with an icon and ring",
    (sourceType, label, ring) => {
      render(<ProvenanceChip sourceType={sourceType} />);
      const chip = screen.getByText(label);
      expect(chip.querySelector("svg")).not.toBeNull();
      expect(chip.className).toContain(ring);
    }
  );
});
