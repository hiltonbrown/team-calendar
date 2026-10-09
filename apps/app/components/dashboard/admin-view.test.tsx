import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminView } from "./admin-view";
import {
  buildAdminView,
  FIXTURE_NOW,
  sectionHeadings,
} from "./dashboard-view-fixtures";

const XERO_EXCEPTION = /connect xero|xero sync|sync health|not connected/i;

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("AdminView", () => {
  afterEach(cleanup);

  it("shows the organisation timeline and approvals without exception cards", () => {
    render(
      <AdminView
        now={FIXTURE_NOW}
        orgQueryValue="org_2"
        personId="person_1"
        view={buildAdminView({ pendingCount: 1 })}
      />
    );
    expect(screen.getByText("Acme Org · 48 people")).toBeDefined();
    expect(
      screen
        .getByRole("link", { name: "Review 1 request" })
        .getAttribute("href")
    ).toBe("/leave-approvals?status=submitted&org=org_2");
    expect(
      screen.getByRole("link", { name: "Open calendar" }).getAttribute("href")
    ).toBe("/calendar?scopeType=all_teams&view=week&org=org_2");
    expect(screen.getByText("All teams")).toBeDefined();
    expect(sectionHeadings()).toEqual([
      "Who is in this week",
      "Needs your reply (1)",
      "Waiting for approval (1)",
      "Balances",
      "Next public holiday",
    ]);
    expect(screen.queryByText(XERO_EXCEPTION)).toBeNull();
  });
});
