import type { DashboardApprovalRow } from "@repo/availability";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApprovalRows, waitingLabel } from "./approval-rows";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const NOW = new Date("2026-10-09T02:00:00.000Z");
const TIMEZONE = "Australia/Brisbane";

function buildRow(
  overrides: Partial<DashboardApprovalRow> = {}
): DashboardApprovalRow {
  return {
    allDay: true,
    durationWorkingDays: 3,
    endsAt: new Date("2026-10-14T23:59:59.999Z"),
    personFirstName: "Luca",
    personLastName: "Brown",
    recordId: "record_1",
    recordType: "annual_leave",
    sourceType: "team_calendar_leave",
    startsAt: new Date("2026-10-12T00:00:00.000Z"),
    submittedAt: new Date("2026-10-06T01:00:00.000Z"),
    ...overrides,
  };
}

describe("ApprovalRows", () => {
  afterEach(cleanup);

  it("lists waiting requests with the count in the title", () => {
    render(
      <ApprovalRows
        now={NOW}
        orgQueryValue="org_2"
        state={{
          data: {
            count: 7,
            rows: [
              buildRow(),
              buildRow({
                durationWorkingDays: 1,
                endsAt: new Date("2026-10-15T23:59:59.999Z"),
                personFirstName: "Mia",
                personLastName: "Stone",
                recordId: "record_2",
                recordType: "personal_leave",
                sourceType: "xero_leave",
                startsAt: new Date("2026-10-15T00:00:00.000Z"),
                submittedAt: new Date("2026-10-09T00:30:00.000Z"),
              }),
            ],
          },
          status: "ready",
        }}
        timezone={TIMEZONE}
        title="Waiting for your approval"
      />
    );
    expect(screen.getByText("Waiting for your approval (7)")).toBeDefined();
    const [first, second] = screen.getAllByRole("listitem");
    if (!(first && second)) {
      throw new Error("Expected two rows");
    }
    expect(within(first).getByText("Luca Brown")).toBeDefined();
    expect(
      within(first).getByText(
        "Annual leave · Mon 12 to Wed 14 Oct · 3 working days"
      )
    ).toBeDefined();
    expect(within(first).getByText("Leave request")).toBeDefined();
    expect(within(first).getByText("Waiting 3 days")).toBeDefined();
    expect(
      within(first)
        .getByRole("link", { name: "Review Luca Brown's annual leave request" })
        .getAttribute("href")
    ).toBe("/leave-approvals?status=submitted&org=org_2");
    expect(
      within(second).getByText("Personal leave · Thu 15 Oct · 1 working day")
    ).toBeDefined();
    expect(within(second).getByText("Synced from Xero")).toBeDefined();
    expect(within(second).getByText("Submitted today")).toBeDefined();
    expect(screen.getByRole("link", { name: "View all" })).toBeDefined();
  });

  it("says when nothing is waiting and links to approvals", () => {
    render(
      <ApprovalRows
        now={NOW}
        orgQueryValue={null}
        state={{ data: { count: 0, rows: [] }, status: "ready" }}
        timezone={TIMEZONE}
        title="Waiting for approval"
      />
    );
    expect(screen.getByText("Waiting for approval")).toBeDefined();
    expect(screen.getByText("No requests are waiting.")).toBeDefined();
    expect(
      screen.getByRole("link", { name: "Open approvals" }).getAttribute("href")
    ).toBe("/leave-approvals?status=submitted");
  });

  it("shows an error state", () => {
    render(
      <ApprovalRows
        now={NOW}
        orgQueryValue={null}
        state={{ message: "Approvals unavailable", status: "error" }}
        timezone={TIMEZONE}
        title="Waiting for approval"
      />
    );
    expect(screen.getByRole("button", { name: "Retry" })).toBeDefined();
  });

  it.each([
    [null, "Waiting"],
    [new Date("2026-10-08T03:00:00.000Z"), "Submitted today"],
    [new Date("2026-10-08T01:00:00.000Z"), "Waiting 1 day"],
  ])("labels a request submitted at %s as %s", (submittedAt, label) => {
    expect(waitingLabel(submittedAt, NOW)).toBe(label);
  });
});
