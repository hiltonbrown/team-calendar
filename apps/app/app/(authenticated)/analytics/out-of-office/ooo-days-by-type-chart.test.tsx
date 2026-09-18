import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OooDaysByTypeChart } from "./ooo-days-by-type-chart";

const SUMMARY_PATTERN = /most common type/;

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

describe("OooDaysByTypeChart", () => {
  afterEach(cleanup);

  it("exposes every type and exact value semantically", () => {
    render(
      <OooDaysByTypeChart
        data={[
          { days: 24.5, label: "Working from home", recordType: "wfh" },
          {
            days: 7,
            label: "Client site with a deliberately long destination label",
            recordType: "client_site",
          },
        ]}
      />
    );

    expect(screen.getByText(SUMMARY_PATTERN)).toBeDefined();
    expect(screen.getByText("Working from home")).toBeDefined();
    expect(screen.getByText("24.5 days")).toBeDefined();
    expect(
      screen.getByText("Client site with a deliberately long destination label")
    ).toBeDefined();
    expect(screen.getByText("7 days")).toBeDefined();
  });
});
