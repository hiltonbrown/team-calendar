import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { OnboardingState } from "@/lib/server/load-onboarding-state";
import { OnboardingChecklist } from "./onboarding-checklist";

const organisationId = "00000000-0000-4000-8000-000000000001";

describe("OnboardingChecklist", () => {
  afterEach(cleanup);

  it("promotes one next action and discloses quieter remaining groups", () => {
    const { container } = render(
      <OnboardingChecklist
        orgQueryValue={organisationId}
        state={incompleteState}
      />
    );

    const progress = screen.getByRole("progressbar", {
      name: "Required setup progress",
    });
    expect(progress.getAttribute("value")).toBe("1");
    expect(progress.getAttribute("max")).toBe("4");
    expect(screen.getByText("1 of 4 required steps complete.")).toBeDefined();

    const nextAction = screen.getByRole("link", { name: "Add people" });
    expect(nextAction.getAttribute("href")).toBe(
      `/people?org=${organisationId}`
    );
    const primaryActions = [...container.querySelectorAll("a")].filter((link) =>
      link.classList.contains("bg-primary")
    );
    expect(primaryActions).toHaveLength(1);
    expect(primaryActions[0]).toBe(nextAction);

    expect(screen.getByText("Completed (1)")).toBeDefined();
    expect(screen.getByText("Optional and later (3)")).toBeDefined();
    expect(screen.getByText("Done")).toBeDefined();
    expect(screen.getByText("Next")).toBeDefined();
    expect(screen.getByText("Optional")).toBeDefined();
    expect(screen.getAllByText("Later")).toHaveLength(2);

    for (const link of container.querySelectorAll("a")) {
      expect(link.getAttribute("href")).toContain(`org=${organisationId}`);
    }
  });

  it("gives completed setup one clear return-to-work action", () => {
    const { container } = render(
      <OnboardingChecklist
        orgQueryValue={organisationId}
        state={completeState}
      />
    );

    expect(
      screen.getByText("Setup complete. 4 of 4 required steps complete.")
    ).toBeDefined();
    expect(
      screen
        .getByRole("progressbar", { name: "Required setup progress" })
        .getAttribute("value")
    ).toBe("4");
    expect(
      screen
        .getByRole("link", { name: "Return to dashboard" })
        .getAttribute("href")
    ).toBe(`/?org=${organisationId}`);
    expect(
      [...container.querySelectorAll("a")].filter((link) =>
        link.classList.contains("bg-primary")
      )
    ).toHaveLength(1);
  });
});

const incompleteState: OnboardingState = {
  activeFeedCount: 0,
  completedRequiredCount: 1,
  currentUserPersonLinked: false,
  hasActiveXeroConnection: false,
  isComplete: false,
  peopleCount: 0,
  publicHolidayJurisdictionCount: 0,
  requiredCount: 4,
  steps: [
    {
      ctaHref: "/settings/general",
      ctaLabel: "Review profile",
      description: "Organisation profile is ready.",
      id: "profile",
      status: "complete",
      title: "Review organisation profile",
    },
    {
      ctaHref: "/settings/integrations/xero",
      ctaLabel: "Connect Xero",
      description: "Connect now or skip for later.",
      id: "xero",
      status: "optional",
      title: "Connect Xero",
    },
    {
      ctaHref: "/people",
      ctaLabel: "Add people",
      description: "Add people manually or sync them.",
      id: "people",
      status: "next",
      title: "Add or sync people",
    },
    {
      ctaHref: "/settings/holidays",
      ctaLabel: "Review setup",
      description: "Review regional and custom dates.",
      id: "holidays",
      status: "pending",
      title: "Review public holidays",
    },
    {
      ctaHref: "/feeds",
      ctaLabel: "Create feed",
      description: "Create a calendar feed.",
      id: "feed",
      status: "pending",
      title: "Review calendar feed",
    },
  ],
};

const completeState: OnboardingState = {
  ...incompleteState,
  activeFeedCount: 1,
  completedRequiredCount: 4,
  currentUserPersonLinked: true,
  isComplete: true,
  peopleCount: 2,
  publicHolidayJurisdictionCount: 1,
  steps: incompleteState.steps.map((step) =>
    step.id === "xero" ? step : { ...step, status: "complete" }
  ),
};
