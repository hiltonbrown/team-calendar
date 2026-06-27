import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  feedCount: vi.fn(),
  organisationCount: vi.fn(),
  personCount: vi.fn(),
  usageUpsert: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../client", () => ({
  inngest: {
    createFunction: vi.fn(() => ({ id: "recount-usage" })),
    send: vi.fn(),
  },
}));
vi.mock("@repo/database", () => ({
  database: {
    feed: { count: mocks.feedCount },
    organisation: { count: mocks.organisationCount },
    person: { count: mocks.personCount },
    usageCounter: { upsert: mocks.usageUpsert },
  },
}));
vi.mock("@repo/observability/log", () => ({
  log: { error: vi.fn(), info: vi.fn() },
}));

const { recountUsage } = await import("./recount-usage");

const ORG = "org_recount";
const ORGANISATION = "22222222-2222-4222-8222-222222222222";

describe("recountUsage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.personCount.mockResolvedValue(7);
    mocks.organisationCount.mockResolvedValue(2);
    mocks.feedCount.mockResolvedValue(3);
    mocks.usageUpsert.mockResolvedValue({});
  });

  it("counts active rows only and writes one counter per dimension", async () => {
    const result = await recountUsage({
      clerkOrgId: ORG,
      organisationId: ORGANISATION,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.counts).toEqual({
        feeds: 3,
        payroll_entities: 2,
        seats: 7,
      });
    }

    // Archived rows are excluded from every count.
    expect(mocks.personCount).toHaveBeenCalledWith({
      where: { archived_at: null, clerk_org_id: ORG },
    });
    expect(mocks.organisationCount).toHaveBeenCalledWith({
      where: { archived_at: null, clerk_org_id: ORG },
    });
    expect(mocks.feedCount).toHaveBeenCalledWith({
      where: { archived_at: null, clerk_org_id: ORG, status: "active" },
    });

    expect(mocks.usageUpsert).toHaveBeenCalledTimes(3);
  });

  it("upserts on the (clerk_org_id, counter_type) unique key", async () => {
    await recountUsage({ clerkOrgId: ORG, organisationId: ORGANISATION });

    interface UsageUpsertArg {
      update: { current_value: number };
      where: {
        clerk_org_id_counter_type: {
          clerk_org_id: string;
          counter_type: string;
        };
      };
    }
    // Mock call args are untyped; cast to the shape recountUsage passes.
    const seatsCall = mocks.usageUpsert.mock.calls
      .map((call) => call[0] as UsageUpsertArg)
      .find(
        (arg) => arg.where.clerk_org_id_counter_type.counter_type === "seats"
      );

    expect(seatsCall?.where.clerk_org_id_counter_type).toEqual({
      clerk_org_id: ORG,
      counter_type: "seats",
    });
    expect(seatsCall?.update.current_value).toBe(7);
  });

  it("is idempotent: a re-run issues the same upserts", async () => {
    await recountUsage({ clerkOrgId: ORG, organisationId: ORGANISATION });
    const first = mocks.usageUpsert.mock.calls.length;
    await recountUsage({ clerkOrgId: ORG, organisationId: ORGANISATION });

    expect(mocks.usageUpsert.mock.calls.length).toBe(first * 2);
  });

  it("rejects a payload missing the organisation id", async () => {
    const result = await recountUsage({ clerkOrgId: ORG });
    expect(result.ok).toBe(false);
  });
});
