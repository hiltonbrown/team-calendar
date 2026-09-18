import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultRecurrenceRule } from "../recurrence";
import { RecurrenceFields } from "./recurrence-fields";

describe("RecurrenceFields", () => {
  afterEach(cleanup);

  it("uses the readable small-text token for preview dates", () => {
    const startDate = "2026-04-10";

    render(
      <RecurrenceFields
        endDate={startDate}
        frequency="daily"
        onFrequencyChange={vi.fn()}
        onRuleChange={vi.fn()}
        rule={{
          ...createDefaultRecurrenceRule("daily", startDate),
          occurrenceCount: 2,
        }}
        startDate={startDate}
      />
    );

    const previewDates = [
      screen.getByText("10 Apr 2026"),
      screen.getByText("11 Apr 2026"),
    ];

    for (const previewDate of previewDates) {
      expect(previewDate.classList.contains("text-label-sm")).toBe(true);
      expect(previewDate.classList.contains("text-[10px]")).toBe(false);
    }
  });
});
