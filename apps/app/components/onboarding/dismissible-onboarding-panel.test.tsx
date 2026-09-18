import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { OnboardingState } from "@/lib/server/load-onboarding-state";
import { DismissibleOnboardingPanel } from "./dismissible-onboarding-panel";

const organisationId = "00000000-0000-4000-8000-000000000001";

describe("DismissibleOnboardingPanel", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);

  it("shows a concise dashboard summary instead of the full checklist", () => {
    renderPanel(incompleteState);

    expect(screen.getByText("Continue setup")).toBeDefined();
    expect(
      screen.getByText(
        "1 of 4 required steps complete, next: Add or sync people."
      )
    ).toBeDefined();
    expect(
      screen.getByRole("link", { name: "Review setup" }).getAttribute("href")
    ).toBe(`/settings/getting-started?org=${organisationId}`);
    expect(screen.queryByText("Review organisation profile")).toBeNull();
    expect(screen.queryByRole("link", { name: "Add people" })).toBeNull();
  });

  it("preserves dashboard dismissal", async () => {
    renderPanel(incompleteState);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await waitFor(() =>
      expect(screen.queryByText("Continue setup")).toBeNull()
    );
  });

  it("stays hidden after required setup is complete", () => {
    renderPanel({ ...incompleteState, isComplete: true });
    expect(screen.queryByText("Continue setup")).toBeNull();
  });
});

function renderPanel(onboarding: OnboardingState) {
  return render(
    <DismissibleOnboardingPanel
      clerkOrgId="org_1"
      onboarding={onboarding}
      organisationId={organisationId}
      orgQueryValue={organisationId}
      userId="user_1"
    />
  );
}

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
      ctaHref: "/people",
      ctaLabel: "Add people",
      description: "Add people manually or sync them.",
      id: "people",
      status: "next",
      title: "Add or sync people",
    },
  ],
};
