import type { DashboardInfoRequest } from "@repo/availability";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NeedsReply } from "./needs-reply";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

function buildRequest(
  overrides: Partial<DashboardInfoRequest> = {}
): DashboardInfoRequest {
  return {
    actionUrl: "/plans?tab=my",
    body: "Please add more detail",
    createdAt: new Date("2026-10-08T09:00:00.000Z"),
    notificationId: "notification_1",
    title: "More information requested",
    type: "leave_info_requested",
    ...overrides,
  };
}

describe("NeedsReply", () => {
  afterEach(cleanup);

  it("lists information requests with a reply link", () => {
    render(
      <NeedsReply
        orgQueryValue="org_2"
        state={{
          data: {
            infoRequestedNotifications: [
              buildRequest(),
              buildRequest({
                actionUrl: null,
                notificationId: "notification_2",
              }),
            ],
          },
          status: "ready",
        }}
      />
    );
    expect(screen.getByText("Needs your reply (2)")).toBeDefined();
    const links = screen.getAllByRole("link", {
      name: "Reply: More information requested",
    });
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/plans?tab=my&org=org_2",
      "/notifications?type=leave_info_requested&unreadOnly=true&org=org_2",
    ]);
    expect(screen.getAllByText("Please add more detail")).toHaveLength(2);
  });

  it("is hidden when nothing needs a reply", () => {
    const { container } = render(
      <NeedsReply
        orgQueryValue={null}
        state={{ data: { infoRequestedNotifications: [] }, status: "ready" }}
      />
    );
    expect(container.innerHTML).toBe("");
  });

  it("shows an error state", () => {
    render(
      <NeedsReply
        orgQueryValue={null}
        state={{ message: "Notifications unavailable", status: "error" }}
      />
    );
    expect(screen.getByRole("button", { name: "Retry" })).toBeDefined();
  });
});
