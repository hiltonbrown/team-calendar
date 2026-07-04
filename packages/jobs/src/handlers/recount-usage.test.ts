import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executeRaw: vi.fn(() => Promise.resolve(1)),
  feedCount: vi.fn(),
  organisationCount: vi.fn(),
  personCount: vi.fn(),
}));

vi.mock("../client", () => ({
  inngest: {
    createFunction: vi.fn(() => ({ id: "recount-usage" })),
    send: vi.fn(),
  },
}));
vi.mock("@repo/database", () => ({
  database: {
    $executeRaw: mocks.executeRaw,
    feed: { count: mocks.feedCount },
    organisation: { count: mocks.organisationCount },
    person: { count: mocks.personCount },
  },
}));

const { recountUsage } = await import("./recount-usage");

const CLERK_ORG_ID = "org_recount";
const ORGANISATION_ID = "30000000-0000-4000-8000-000000000001";

function input(overrides: Record<string, unknown> = {}) {
  return {
    clerkOrgId: CLERK_ORG_ID,
    organisationId: ORGANISATION_ID,
    ...overrides,
  };
}

describe("recountUsage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.personCount.mockResolvedValue(7);
    mocks.organisationCount.mockResolvedValue(2);
    mocks.feedCount.mockResolvedValue(3);
    mocks.executeRaw.mockResolvedValue(1);
  });

  it("counts active seats, payroll entities and active feeds scoped to the org", async () => {
    const result = await recountUsage(input());

    expect(result).toEqual({ feeds: 3, payrollEntities: 2, seats: 7 });
    expect(mocks.personCount).toHaveBeenCalledWith({
      where: { archived_at: null, clerk_org_id: CLERK_ORG_ID },
    });
    expect(mocks.organisationCount).toHaveBeenCalledWith({
      where: { archived_at: null, clerk_org_id: CLERK_ORG_ID },
    });
    expect(mocks.feedCount).toHaveBeenCalledWith({
      where: {
        archived_at: null,
        clerk_org_id: CLERK_ORG_ID,
        status: "active",
      },
    });
  });

  it("upserts one usage counter per metric", async () => {
    await recountUsage(input());

    expect(mocks.executeRaw).toHaveBeenCalledTimes(3);
  });

  it("rejects input with a missing clerkOrgId", async () => {
    await expect(recountUsage(input({ clerkOrgId: "" }))).rejects.toThrow();
    expect(mocks.executeRaw).not.toHaveBeenCalled();
  });

  it("rejects input with a non-uuid organisationId", async () => {
    await expect(
      recountUsage(input({ organisationId: "not-a-uuid" }))
    ).rejects.toThrow();
    expect(mocks.executeRaw).not.toHaveBeenCalled();
  });

  it("accepts a payload without organisationId, since the job is scoped by clerkOrgId alone", async () => {
    const { organisationId: _organisationId, ...withoutOrganisationId } =
      input();

    const result = await recountUsage(withoutOrganisationId);

    expect(result).toEqual({ feeds: 3, payrollEntities: 2, seats: 7 });
    expect(mocks.executeRaw).toHaveBeenCalledTimes(3);
  });

  it("still accepts a payload that includes a valid organisationId", async () => {
    const result = await recountUsage(input());

    expect(result).toEqual({ feeds: 3, payrollEntities: 2, seats: 7 });
  });
});
