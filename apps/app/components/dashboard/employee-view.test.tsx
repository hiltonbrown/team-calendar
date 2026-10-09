import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildEmployeeView,
  FIXTURE_NOW,
  sectionHeadings,
} from "./dashboard-view-fixtures";
import { EmployeeView } from "./employee-view";

const CONNECT_XERO = /connect xero/i;

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("EmployeeView", () => {
  afterEach(cleanup);

  it("leads with the date, the self timeline and the employee sections", () => {
    render(
      <EmployeeView
        now={FIXTURE_NOW}
        orgQueryValue={null}
        personId="person_1"
        view={buildEmployeeView()}
      />
    );
    expect(screen.getByText("Friday 9 October 2026 · Brisbane")).toBeDefined();
    expect(screen.getByText("Your leave and availability")).toBeDefined();
    expect(
      screen.getByRole("link", { name: "Request leave" }).getAttribute("href")
    ).toBe("/plans/new");
    expect(
      screen.getByRole("link", { name: "Open calendar" }).getAttribute("href")
    ).toBe("/calendar?scopeType=my_self&view=week");
    expect(screen.getByText("Me")).toBeDefined();
    expect(sectionHeadings()).toEqual([
      "Who is in this week",
      "Needs your reply (1)",
      "My requests",
      "Balances",
      "Next public holiday",
    ]);
  });

  it.each(["not_connected", "unavailable"] as const)(
    "shows no Xero banner or balances when Xero is %s",
    (xeroConnectionState) => {
      render(
        <EmployeeView
          now={FIXTURE_NOW}
          orgQueryValue={null}
          personId="person_1"
          view={buildEmployeeView({
            balances: {
              data: {
                isXeroLinked: false,
                lastFetchedAt: null,
                rows: [],
                xeroConnectionState,
              },
              status: "ready",
            },
          })}
        />
      );
      expect(screen.queryByText(CONNECT_XERO)).toBeNull();
      expect(screen.queryByText("Balances")).toBeNull();
    }
  );
});
