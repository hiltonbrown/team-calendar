import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  PeopleProvenanceBadge,
  PeopleStatusChip,
} from "./people-status-provenance";

describe("People status and provenance", () => {
  afterEach(() => cleanup());

  it("uses the shared status chip treatment on the product type scale", () => {
    render(<PeopleStatusChip label="Available" statusKey="available" />);

    const chip = screen.getByText("Available");
    expect(chip.className).toContain("rounded-xl");
    expect(chip.className).toContain("text-label-md");
  });

  it.each([
    [true, "Linked", "Source: Synced from Xero."],
    [false, "Manual", "Source: Manual entry."],
  ])("labels the source when xeroLinked is %s", (xeroLinked, label, source) => {
    render(<PeopleProvenanceBadge xeroLinked={xeroLinked} />);

    expect(screen.getByText(label)).toBeDefined();
    expect(screen.getByText(source)).toBeDefined();
  });
});
