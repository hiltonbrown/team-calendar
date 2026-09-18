import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OooDaysMonthlyChart } from "./ooo-days-monthly-chart";

vi.mock("@repo/design-system/components/ui/chart", () => ({
  ChartContainer: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  ChartTooltip: () => null,
  ChartTooltipContent: () => null,
}));

vi.mock("recharts", () => ({
  Bar: ({ name }: { name: string }) => <span>{name}</span>,
  BarChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CartesianGrid: () => null,
  Legend: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

describe("OooDaysMonthlyChart", () => {
  afterEach(cleanup);

  it("lists every month, series label and exact value without colour", () => {
    render(
      <OooDaysMonthlyChart
        data={[
          {
            another_office: 4,
            client_site: 3,
            month: "Aug 26",
            offsite_meeting: 2,
            training: 1,
            travelling: 5,
          },
        ]}
        recordTypes={[
          "travelling",
          "training",
          "client_site",
          "another_office",
          "offsite_meeting",
        ]}
      />
    );

    expect(screen.getByRole("heading", { name: "Aug 26" })).toBeDefined();
    expect(screen.getAllByText("Travelling").length).toBeGreaterThan(0);
    expect(screen.getByText("5 days")).toBeDefined();
    expect(screen.getByText("1 day")).toBeDefined();
    expect(screen.getByText("3 days")).toBeDefined();
    expect(screen.getByText("4 days")).toBeDefined();
    expect(screen.getByText("2 days")).toBeDefined();
  });
});
