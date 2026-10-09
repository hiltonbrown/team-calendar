import type {
  CoverageCell,
  CoverageMap,
  CoverageRow,
} from "@repo/availability";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CoverageMapCard,
  coverageCellAriaLabel,
  coverageSummary,
} from "./coverage-map";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const NO_TEAM = /No team/;
const DAY_KEYS = [
  "2026-10-12",
  "2026-10-13",
  "2026-10-14",
  "2026-10-15",
  "2026-10-16",
];

function buildCell(overrides: Partial<CoverageCell> = {}): CoverageCell {
  return {
    awayCount: 0,
    dateKey: "2026-10-12",
    inCount: 3,
    shortBy: 0,
    state: "covered",
    ...overrides,
  };
}

function buildRow(overrides: Partial<CoverageRow> = {}): CoverageRow {
  return {
    cells: [
      buildCell({ awayCount: 2, inCount: 1, shortBy: 1, state: "short" }),
      buildCell({ dateKey: "2026-10-13", inCount: 2, state: "at_minimum" }),
      buildCell({ dateKey: "2026-10-14" }),
      buildCell({ dateKey: "2026-10-15", state: "holiday" }),
      buildCell({
        awayCount: 1,
        dateKey: "2026-10-16",
        inCount: 2,
        state: "peak",
      }),
    ],
    minimum: 2,
    teamId: "team_1",
    teamName: "Customer support",
    teamSize: 3,
    ...overrides,
  };
}

function buildMap(overrides: Partial<CoverageMap> = {}): CoverageMap {
  return {
    days: DAY_KEYS.map((dateKey, index) => ({
      date: new Date(`${dateKey}T00:00:00.000Z`),
      dateKey,
      isToday: index === 0,
    })),
    firstIssue: {
      dateKey: "2026-10-12",
      inCount: 1,
      minimum: 2,
      state: "short",
      teamName: "Customer support",
      teamSize: 3,
    },
    rows: [buildRow()],
    ...overrides,
  };
}

describe("CoverageMapCard", () => {
  afterEach(cleanup);

  it("summarises the next shortfall and every cell state with text", () => {
    render(
      <CoverageMapCard
        orgQueryValue={null}
        state={{ data: buildMap(), status: "ready" }}
      />
    );
    expect(
      screen.getByText(
        "Next shortfall: Customer support, Monday 12 October, 1 of 3 in (minimum 2)"
      )
    ).toBeDefined();
    const short = screen.getByRole("link", {
      name: "Monday 12 October, Customer support: 1 of 3 in, short by 1",
    });
    expect(short.className).toContain("bg-warning-container");
    expect(within(short).getByText("Short by 1")).toBeDefined();
    expect(short.querySelector("svg")).not.toBeNull();
    expect(short.getAttribute("href")).toBe(
      "/calendar?scopeType=team&scopeValue=team_1&view=day&anchor=2026-10-12"
    );

    const atMinimum = screen.getByRole("link", {
      name: "Tuesday 13 October, Customer support: 2 of 3 in, at minimum",
    });
    expect(atMinimum.className).toContain("bg-chart-4");
    expect(within(atMinimum).getByText("At minimum")).toBeDefined();

    const covered = screen.getByRole("link", {
      name: "Wednesday 14 October, Customer support: 3 of 3 in",
    });
    expect(covered.className).toContain("bg-surface-container");
    expect(within(covered).getByText("3 of 3")).toBeDefined();

    const holiday = screen.getByRole("link", {
      name: "Thursday 15 October, Customer support: public holiday",
    });
    expect(holiday.className).toContain("bg-surface-container-high");
    expect(within(holiday).getByText("Holiday")).toBeDefined();

    const peak = screen.getByRole("link", {
      name: "Friday 16 October, Customer support: 2 of 3 in, peak",
    });
    expect(peak.className).toContain("bg-warning-container");
    expect(within(peak).getByText("Peak")).toBeDefined();
  });

  it("does not link the No team row and keeps the organisation on links", () => {
    render(
      <CoverageMapCard
        orgQueryValue="org_2"
        state={{
          data: buildMap({
            rows: [
              buildRow(),
              buildRow({ minimum: null, teamId: null, teamName: "No team" }),
            ],
          }),
          status: "ready",
        }}
      />
    );
    expect(
      screen
        .getByRole("link", {
          name: "Monday 12 October, Customer support: 1 of 3 in, short by 1",
        })
        .getAttribute("href")
    ).toBe(
      "/calendar?scopeType=team&scopeValue=team_1&view=day&anchor=2026-10-12&org=org_2"
    );
    expect(screen.queryByRole("link", { name: NO_TEAM })).toBeNull();
    expect(
      screen.getByRole("img", {
        name: "Monday 12 October, No team: 1 of 3 in, short by 1",
      })
    ).toBeDefined();
  });

  it("shows the key and footnote", () => {
    render(
      <CoverageMapCard
        orgQueryValue={null}
        state={{ data: buildMap({ firstIssue: null }), status: "ready" }}
      />
    );
    expect(
      screen.getByText("Every team is covered for the next five working days.")
    ).toBeDefined();
    const key = screen.getByRole("list", { name: "Coverage key" });
    expect(within(key).getByText("At minimum")).toBeDefined();
    expect(
      screen.getByText(
        "Counts approved leave and time away, such as training, travel, client sites and other offices. Working from home counts as in."
      )
    ).toBeDefined();
  });

  it("shows an error state", () => {
    render(
      <CoverageMapCard
        orgQueryValue={null}
        state={{ message: "Coverage unavailable", status: "error" }}
      />
    );
    expect(screen.getByText("Coverage")).toBeDefined();
    expect(screen.getByRole("button", { name: "Retry" })).toBeDefined();
  });
});

describe("coverage copy", () => {
  it("describes a peak absence", () => {
    expect(
      coverageSummary({
        dateKey: "2026-10-12",
        inCount: 5,
        minimum: null,
        state: "peak",
        teamName: "Operations",
        teamSize: 7,
      })
    ).toBe("Next peak absence: Operations, Monday 12 October, 5 of 7 in");
  });

  it("labels a cell for screen readers", () => {
    expect(coverageCellAriaLabel(buildRow(), buildCell())).toBe(
      "Monday 12 October, Customer support: 3 of 3 in"
    );
  });
});
