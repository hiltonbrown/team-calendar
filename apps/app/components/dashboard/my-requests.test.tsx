import type { DashboardMyRequest } from "@repo/availability";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MyRequests } from "./my-requests";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const TIMEZONE = "Australia/Brisbane";
const WITHDRAW = /^Withdraw/;
const EDIT = /^Edit/;
const VIEW = /^View/;

function buildRequest(
  overrides: Partial<DashboardMyRequest> = {}
): DashboardMyRequest {
  return {
    allDay: true,
    approvalStatus: "submitted",
    canEdit: false,
    canWithdraw: true,
    dayCount: 2,
    endsAt: new Date("2026-10-13T23:59:59.999Z"),
    recordId: "record_1",
    recordType: "annual_leave",
    sourceType: "team_calendar_leave",
    startsAt: new Date("2026-10-12T00:00:00.000Z"),
    ...overrides,
  };
}

describe("MyRequests", () => {
  afterEach(cleanup);

  it("shows each request with its status and one action", () => {
    render(
      <MyRequests
        orgQueryValue={null}
        state={{
          data: {
            records: [
              buildRequest(),
              buildRequest({
                approvalStatus: "approved",
                canEdit: true,
                canWithdraw: false,
                dayCount: 1,
                endsAt: new Date("2026-10-14T23:59:59.999Z"),
                recordId: "record_2",
                recordType: "wfh",
                sourceType: "manual",
                startsAt: new Date("2026-10-14T00:00:00.000Z"),
              }),
              buildRequest({
                approvalStatus: "declined",
                canWithdraw: false,
                dayCount: null,
                recordId: "record_3",
              }),
            ],
          },
          status: "ready",
        }}
        timezone={TIMEZONE}
      />
    );
    const [submitted, approved, declined] = screen.getAllByRole("listitem");
    if (!(submitted && approved && declined)) {
      throw new Error("Expected three rows");
    }
    expect(within(submitted).getByText("Annual leave")).toBeDefined();
    expect(within(submitted).getByText("Pending")).toBeDefined();
    expect(submitted.querySelector("svg")).not.toBeNull();
    expect(
      within(submitted).getByText("Mon 12 to Tue 13 Oct · 2 working days")
    ).toBeDefined();
    expect(
      within(submitted)
        .getByRole("link", { name: WITHDRAW })
        .getAttribute("href")
    ).toBe("/plans?tab=my");
    expect(within(approved).getByText("Working from home")).toBeDefined();
    expect(within(approved).getByText("Approved")).toBeDefined();
    expect(
      within(approved).getByRole("link", { name: EDIT }).getAttribute("href")
    ).toBe("/plans/record_2/edit");
    expect(within(declined).getByText("Declined")).toBeDefined();
    expect(within(declined).getByText("Mon 12 to Tue 13 Oct")).toBeDefined();
    expect(within(declined).getByRole("link", { name: VIEW })).toBeDefined();
  });

  it("is hidden when there are no requests", () => {
    const { container } = render(
      <MyRequests
        orgQueryValue={null}
        state={{ data: { records: [] }, status: "ready" }}
        timezone={TIMEZONE}
      />
    );
    expect(container.innerHTML).toBe("");
  });

  it("shows an error state", () => {
    render(
      <MyRequests
        orgQueryValue={null}
        state={{ message: "Records unavailable", status: "error" }}
        timezone={TIMEZONE}
      />
    );
    expect(screen.getByText("My requests")).toBeDefined();
    expect(screen.getByRole("button", { name: "Retry" })).toBeDefined();
  });
});
