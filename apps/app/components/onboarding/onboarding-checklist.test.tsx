import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { OnboardingState } from "@/lib/server/load-onboarding-state";
import { OnboardingChecklist } from "./onboarding-checklist";

const organisationId = "00000000-0000-4000-8000-000000000001";
const SETUP_COMPLETE = /Setup is complete/;

describe("OnboardingChecklist", () => {
  afterEach(cleanup);

  it("presents post-setup recommendations with one next action", () => {
    const { container } = render(
      <OnboardingChecklist
        orgQueryValue={organisationId}
        state={incompleteState}
      />
    );
    expect(
      screen.getByRole("heading", { name: "Recommended next steps" })
    ).toBeDefined();
    expect(screen.getByText(SETUP_COMPLETE)).toBeDefined();
    const progress = screen.getByRole("progressbar", {
      name: "Recommended steps progress",
    });
    expect(progress.getAttribute("value")).toBe("1");
    expect(progress.getAttribute("max")).toBe("2");
    expect(
      screen.getByText("1 of 2 recommended steps complete.")
    ).toBeDefined();
    const nextAction = screen.getByRole("link", { name: "Create a feed" });
    expect(nextAction.getAttribute("href")).toBe(
      `/feeds?org=${organisationId}`
    );
    const primaryActions = [...container.querySelectorAll("a")].filter((link) =>
      link.classList.contains("bg-primary")
    );
    expect(primaryActions).toEqual([nextAction]);
    expect(screen.getByText("Connect Xero Payroll")).toBeDefined();
    for (const link of container.querySelectorAll("a")) {
      expect(link.getAttribute("href")).toContain(`org=${organisationId}`);
    }
  });

  it("gives a finished list one clear return-to-work action", () => {
    render(
      <OnboardingChecklist
        orgQueryValue={organisationId}
        state={completeState}
      />
    );
    expect(
      screen.getByRole("heading", { name: "You're all set" })
    ).toBeDefined();
    expect(
      screen.getByText("2 of 2 recommended steps complete.")
    ).toBeDefined();
    expect(
      screen
        .getByRole("link", { name: "Return to dashboard" })
        .getAttribute("href")
    ).toBe(`/?org=${organisationId}`);
  });
});

const incompleteState: OnboardingState = {
  activeFeedCount: 0,
  completedRequiredCount: 1,
  isComplete: false,
  publicHolidayJurisdictionCount: 1,
  requiredCount: 2,
  steps: [
    {
      ctaHref: "/settings/holidays",
      ctaLabel: "Review holidays",
      description: "Check regional dates.",
      id: "holidays",
      status: "complete",
      title: "Review public holidays",
    },
    {
      ctaHref: "/feeds",
      ctaLabel: "Create a feed",
      description: "Create a calendar feed.",
      id: "feed",
      status: "next",
      title: "Add the calendar to your calendar app",
    },
    {
      ctaHref: "/settings/integrations/xero",
      ctaLabel: "Connect Xero",
      description: "Connect Xero Payroll.",
      id: "xero",
      status: "optional",
      title: "Connect Xero Payroll",
    },
  ],
  xeroConnectionState: "not_connected",
};

const completeState: OnboardingState = {
  ...incompleteState,
  activeFeedCount: 1,
  completedRequiredCount: 2,
  isComplete: true,
  steps: incompleteState.steps
    .filter((step) => step.id !== "xero")
    .map((step) => ({ ...step, status: "complete" as const })),
  xeroConnectionState: "connected",
};
