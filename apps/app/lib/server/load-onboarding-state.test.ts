import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  activeXeroConnectionFindFirst: vi.fn(),
  clerkOrgConnectionCount: vi.fn(),
  currentUserPersonFindFirst: vi.fn(),
  feedCount: vi.fn(),
  organisationFindFirst: vi.fn(),
  peopleCount: vi.fn(),
  publicHolidayJurisdictionCount: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => ({
  database: {
    feed: {
      count: mocks.feedCount,
    },
    organisation: {
      findFirst: mocks.organisationFindFirst,
    },
    person: {
      count: mocks.peopleCount,
      findFirst: mocks.currentUserPersonFindFirst,
    },
    publicHolidayJurisdiction: {
      count: mocks.publicHolidayJurisdictionCount,
    },
    xeroConnection: {
      count: mocks.clerkOrgConnectionCount,
      findFirst: mocks.activeXeroConnectionFindFirst,
    },
  },
}));

const { loadOnboardingState } = await import("./load-onboarding-state");

describe("loadOnboardingState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.organisationFindFirst.mockResolvedValue({
      country_code: "AU",
      name: "Acme",
    });
    mocks.clerkOrgConnectionCount.mockResolvedValue(1);
    mocks.activeXeroConnectionFindFirst.mockResolvedValue({ id: "conn_1" });
    mocks.peopleCount.mockResolvedValue(2);
    mocks.currentUserPersonFindFirst.mockResolvedValue({ id: "person_1" });
    mocks.publicHolidayJurisdictionCount.mockResolvedValue(1);
    mocks.feedCount.mockResolvedValue(1);
  });

  it("uses default-feed copy when a feed already exists", async () => {
    const state = await loadOnboardingState({
      clerkOrgId: "org_1",
      organisationId: "00000000-0000-4000-8000-000000000001",
      userId: "user_1",
    });

    const feedStep = state.steps.find((step) => step.id === "feed");
    expect(feedStep).toMatchObject({
      ctaLabel: "View default feed",
      description:
        "Your default all-staff feed is ready. Rotate its token when you need to copy a fresh subscribe URL.",
      status: "complete",
      title: "Review calendar feed",
    });
    expect(state.activeFeedCount).toBe(1);
  });

  it("keeps a manual fallback when no feed exists", async () => {
    mocks.feedCount.mockResolvedValue(0);

    const state = await loadOnboardingState({
      clerkOrgId: "org_1",
      organisationId: "00000000-0000-4000-8000-000000000001",
    });

    const feedStep = state.steps.find((step) => step.id === "feed");
    expect(feedStep).toMatchObject({
      ctaLabel: "Create feed",
      description:
        "Create an ICS feed manually if this organisation does not have a default feed available.",
      title: "Review calendar feed",
    });
  });
});
