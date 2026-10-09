import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildManagerView,
  FIXTURE_NOW,
  sectionHeadings,
} from "./dashboard-view-fixtures";
import { ManagerView } from "./manager-view";

const REVIEW = /^Review/;
const XERO_EXCEPTION = /connect xero|xero sync|sync health|not connected/i;

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("ManagerView", () => {
  afterEach(cleanup);

  it("orders the team timeline, lead and coverage-first rail", () => {
    render(
      <ManagerView
        now={FIXTURE_NOW}
        orgQueryValue={null}
        personId="person_1"
        view={buildManagerView()}
      />
    );
    expect(screen.getByText("6 direct reports")).toBeDefined();
    expect(
      screen
        .getByRole("link", { name: "Review 4 requests" })
        .getAttribute("href")
    ).toBe("/leave-approvals?status=submitted");
    expect(screen.getByRole("link", { name: "Request leave" })).toBeDefined();
    expect(
      screen.getByRole("link", { name: "Open calendar" }).getAttribute("href")
    ).toBe("/calendar?scopeType=my_team&view=week");
    expect(screen.getByText("My team")).toBeDefined();
    expect(sectionHeadings()).toEqual([
      "Who is in this week",
      "Needs your reply (1)",
      "Waiting for your approval (4)",
      "Coverage",
      "Balances",
      "Next public holiday",
    ]);
    expect(screen.queryByText(XERO_EXCEPTION)).toBeNull();
  });

  it("falls back to Request leave when nothing is waiting", () => {
    render(
      <ManagerView
        now={FIXTURE_NOW}
        orgQueryValue={null}
        personId="person_1"
        view={buildManagerView({ pendingCount: 0 })}
      />
    );
    expect(screen.queryByRole("link", { name: REVIEW })).toBeNull();
    expect(screen.getAllByRole("link", { name: "Request leave" })).toHaveLength(
      1
    );
    expect(screen.getByText("No requests are waiting.")).toBeDefined();
  });
});
