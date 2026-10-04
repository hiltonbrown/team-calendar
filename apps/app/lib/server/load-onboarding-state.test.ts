import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUserPersonFindFirst: vi.fn(),
  feedCount: vi.fn(),
  getXeroConnectionStateForScope: vi.fn(),
  organisationFindFirst: vi.fn(),
  pendingMatchesCount: vi.fn(),
  peopleCount: vi.fn(),
  publicHolidayJurisdictionCount: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/availability", () => ({
  getXeroConnectionStateForScope: mocks.getXeroConnectionStateForScope,
}));
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
      findFirst: mocks.getXeroConnectionStateForScope,
    },
    xeroPersonMatch: {
      count: mocks.pendingMatchesCount,
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
    mocks.getXeroConnectionStateForScope.mockResolvedValue({
      ok: true,
      value: { bindingGeneration: 1, state: "connected" },
    });
    mocks.peopleCount.mockResolvedValue(2);
    mocks.currentUserPersonFindFirst.mockResolvedValue({ id: "person_1" });
    mocks.pendingMatchesCount.mockResolvedValue(0);
    mocks.publicHolidayJurisdictionCount.mockResolvedValue(1);
    mocks.feedCount.mockResolvedValue(1);
  });

  it.each([
    [
      "unavailable",
      "We cannot reach Xero right now. Try again later or contact support.",
    ],
    ["disconnect_pending", "Sync stopped. Xero disconnection is pending."],
    ["reauthorisation_required", "Xero access needs to be renewed."],
  ] as const)(
    "does not instruct reconnecting during %s",
    async (xeroState, message) => {
      mocks.getXeroConnectionStateForScope.mockResolvedValue(
        xeroState === "unavailable"
          ? { error: { code: "state_unavailable" }, ok: false }
          : { ok: true, value: { bindingGeneration: 7, state: xeroState } }
      );
      const result = await loadOnboardingState({
        clerkOrgId: "org_1",
        organisationId: "00000000-0000-4000-8000-000000000001",
      });
      expect(result.xeroConnectionState).toBe(xeroState);
      expect(result.steps.find((step) => step.id === "xero")).toMatchObject({
        ctaLabel: "Review Xero",
        description: message,
        title: "Xero connection",
      });
    }
  );

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
        "Your default all-staff feed is ready. Open it whenever you need to copy its subscribe URL.",
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

  it("provisions complete holidays step when jurisdiction exists", async () => {
    mocks.publicHolidayJurisdictionCount.mockResolvedValue(1);

    const state = await loadOnboardingState({
      clerkOrgId: "org_1",
      organisationId: "00000000-0000-4000-8000-000000000001",
      userId: "user_1",
    });

    const holidayStep = state.steps.find((step) => step.id === "holidays");
    expect(holidayStep).toMatchObject({
      ctaLabel: "Review holidays",
      description:
        "Team Calendar imports your organisation's country holidays automatically. Review regional or custom dates.",
      status: "complete",
      title: "Review public holidays",
    });
  });

  it("provisions incomplete holidays step when no jurisdiction exists", async () => {
    mocks.publicHolidayJurisdictionCount.mockResolvedValue(0);

    const state = await loadOnboardingState({
      clerkOrgId: "org_1",
      organisationId: "00000000-0000-4000-8000-000000000001",
      userId: "user_1",
    });

    const holidayStep = state.steps.find((step) => step.id === "holidays");
    expect(holidayStep).toMatchObject({
      ctaLabel: "Review setup",
      description:
        "Team Calendar imports your organisation's country holidays automatically. Review regional or custom dates.",
      status: "next",
      title: "Review public holidays",
    });
  });

  it("keeps a disconnected Xero task optional so one required step leads", async () => {
    mocks.getXeroConnectionStateForScope.mockResolvedValue({
      ok: true,
      value: { bindingGeneration: null, state: "not_connected" },
    });
    mocks.peopleCount.mockResolvedValue(0);
    mocks.currentUserPersonFindFirst.mockResolvedValue(null);

    const state = await loadOnboardingState({
      clerkOrgId: "org_1",
      organisationId: "00000000-0000-4000-8000-000000000001",
      userId: "user_1",
    });

    expect(state.steps.find((step) => step.id === "xero")?.status).toBe(
      "optional"
    );
    expect(state.steps.filter((step) => step.status === "next")).toHaveLength(
      1
    );
    expect(state.steps.find((step) => step.status === "next")?.id).toBe(
      "people"
    );
  });

  it("shows an entity-specific Xero connect step for a second un-connected entity", async () => {
    mocks.getXeroConnectionStateForScope.mockResolvedValue({
      ok: true,
      value: { bindingGeneration: null, state: "not_connected" },
    });

    const state = await loadOnboardingState({
      clerkOrgId: "org_1",
      organisationId: "00000000-0000-4000-8000-000000000002",
      userId: "user_1",
    });

    const xeroStep = state.steps.find((step) => step.id === "xero");
    expect(xeroStep).toMatchObject({
      ctaLabel: "Connect Xero",
      status: "optional",
      title: "Connect Xero",
    });
  });

  it("completes business setup when people exist even if admin user is not a payroll employee", async () => {
    mocks.peopleCount.mockResolvedValue(10);
    mocks.currentUserPersonFindFirst.mockResolvedValue(null);
    mocks.pendingMatchesCount.mockResolvedValue(0);

    const state = await loadOnboardingState({
      clerkOrgId: "org_1",
      organisationId: "00000000-0000-4000-8000-000000000001",
      userId: "admin_external_user",
    });

    const peopleStep = state.steps.find((step) => step.id === "people");
    expect(peopleStep?.status).toBe("complete");
    expect(state.isComplete).toBe(true);
    expect(state.currentUserPersonLinked).toBe(false);
  });

  it("requires review when imported people have pending identity matches", async () => {
    mocks.peopleCount.mockResolvedValue(10);
    mocks.pendingMatchesCount.mockResolvedValue(2);

    const state = await loadOnboardingState({
      clerkOrgId: "org_1",
      organisationId: "00000000-0000-4000-8000-000000000001",
      userId: "user_1",
    });

    const peopleStep = state.steps.find((step) => step.id === "people");
    expect(peopleStep?.status).toBe("next");
    expect(peopleStep?.ctaLabel).toBe("Review people");
    expect(peopleStep?.ctaHref).toBe("/settings/integrations/xero/matches");
    expect(state.isComplete).toBe(false);
    expect(state.pendingPersonMatchesCount).toBe(2);
  });
});
