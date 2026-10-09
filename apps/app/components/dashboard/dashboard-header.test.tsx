import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DashboardHeader } from "./dashboard-header";

describe("DashboardHeader", () => {
  afterEach(cleanup);

  it("shows the date, location, title, scope and actions", () => {
    render(
      <DashboardHeader
        dateLabel="Friday 9 October 2026"
        locationLabel="Brisbane"
        orgQueryValue="org_2"
        primaryAction={{
          href: "/leave-approvals?status=submitted",
          label: "Review 4 requests",
        }}
        scopeLine="6 direct reports"
        secondaryAction={{ href: "/plans/new", label: "Request leave" }}
      />
    );
    expect(screen.getByText("Friday 9 October 2026 · Brisbane")).toBeDefined();
    expect(
      screen.getByRole("heading", { level: 1, name: "Dashboard" })
    ).toBeDefined();
    expect(screen.getByText("6 direct reports")).toBeDefined();
    expect(
      screen
        .getByRole("link", { name: "Review 4 requests" })
        .getAttribute("href")
    ).toBe("/leave-approvals?status=submitted&org=org_2");
    expect(
      screen.getByRole("link", { name: "Request leave" }).getAttribute("href")
    ).toBe("/plans/new?org=org_2");
  });

  it("omits the location and actions when absent", () => {
    render(
      <DashboardHeader
        dateLabel="Friday 9 October 2026"
        locationLabel={null}
        orgQueryValue={null}
        scopeLine="Your leave and availability"
      />
    );
    expect(screen.getByText("Friday 9 October 2026")).toBeDefined();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
