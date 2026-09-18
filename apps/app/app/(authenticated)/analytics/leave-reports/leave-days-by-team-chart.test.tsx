import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LeaveDaysByTeamChart } from "./leave-days-by-team-chart";

const LONG_TEAM_PATTERN = /Customer Experience/;
const SUMMARY_PATTERN = /has the most approved leave/;

vi.mock("@repo/design-system/components/ui/chart", () => ({
  ChartContainer: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  ChartTooltip: () => null,
  ChartTooltipContent: () => null,
}));

vi.mock("recharts", () => ({
  Bar: () => null,
  BarChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

describe("LeaveDaysByTeamChart", () => {
  afterEach(cleanup);

  it("exposes every plotted value in a semantic table", () => {
    render(
      <LeaveDaysByTeamChart
        data={[
          {
            days: 1234.5,
            peopleCount: 18,
            teamName:
              "Customer Experience and International Operations with a deliberately long name",
          },
          { days: 42, peopleCount: 7, teamName: "Finance" },
        ]}
      />
    );

    expect(
      screen.getByRole("table", { name: "Exact approved leave values by team" })
    ).toBeDefined();
    expect(
      screen.getByRole("rowheader", { name: LONG_TEAM_PATTERN })
    ).toBeDefined();
    expect(screen.getByText("1,234.5")).toBeDefined();
    expect(screen.getByRole("rowheader", { name: "Finance" })).toBeDefined();
    expect(screen.getByText("42")).toBeDefined();
    expect(screen.getByText("7")).toBeDefined();
    expect(screen.getByText(SUMMARY_PATTERN)).toBeDefined();
  });
});
