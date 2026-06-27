import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  withinLimit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/auth/entitlements", () => ({
  withinLimit: mocks.withinLimit,
}));
vi.mock("@repo/database", () => ({
  database: {
    person: {
      create: mocks.create,
      findFirst: mocks.findFirst,
      findMany: mocks.findMany,
    },
  },
  scopedQuery: (clerkOrgId: string, organisationId: string) => ({
    clerk_org_id: clerkOrgId,
    organisation_id: organisationId,
  }),
}));

const { ensureCurrentUserPerson } = await import("./current-user-service");

const tenant = {
  clerkOrgId: "org_people",
  organisationId: "44444444-4444-4444-8444-444444444444",
} as Parameters<typeof ensureCurrentUserPerson>[0];

const personInput = {
  clerkUserId: "user_new",
  displayName: "New Person",
  email: "new.person@example.com",
  firstName: "New",
  lastName: "Person",
};

describe("ensureCurrentUserPerson seat enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockResolvedValue(null);
    mocks.findMany.mockResolvedValue([]);
  });

  it("blocks a new seat with a validation_error when over the seat limit", async () => {
    mocks.withinLimit.mockResolvedValue({
      ok: true,
      value: { allowed: false, current: 10, limit: 10 },
    });

    const result = await ensureCurrentUserPerson(tenant, personInput);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("validation_error");
    }
    expect(mocks.withinLimit).toHaveBeenCalledWith(
      tenant.clerkOrgId,
      tenant.organisationId,
      "seats"
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("creates the person when within the seat limit", async () => {
    mocks.withinLimit.mockResolvedValue({
      ok: true,
      value: { allowed: true, current: 4, limit: 10 },
    });
    mocks.create.mockResolvedValue({
      display_name: "New Person",
      email: "new.person@example.com",
      id: "person_1",
      job_title: null,
      location: null,
      team: null,
    });

    const result = await ensureCurrentUserPerson(tenant, personInput);

    expect(result.ok).toBe(true);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
});
