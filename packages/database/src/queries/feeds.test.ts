import type { ClerkOrgId, FeedId, OrganisationId } from "@repo/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("../tenant-client", () => ({
  tenantDatabase: () => ({
    feed: {
      findFirst: mocks.findFirst,
      findMany: mocks.findMany,
    },
  }),
}));

const { listFeedsForOrganisation, getFeedDetail } = await import("./feeds");

describe("feeds queries", () => {
  const clerkOrgId = "org_test_feeds" as ClerkOrgId;
  const organisationId =
    "22222222-2222-4222-8222-222222222222" as OrganisationId;
  const feedId = "33333333-3333-4333-8333-333333333333" as FeedId;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listFeedsForOrganisation carries clerk_org_id and organisation_id", async () => {
    mocks.findMany.mockResolvedValue([]);

    const result = await listFeedsForOrganisation(clerkOrgId, organisationId);

    expect(result).toEqual({ ok: true, value: [] });
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          clerk_org_id: clerkOrgId,
          organisation_id: organisationId,
        },
      })
    );
  });

  it("getFeedDetail carries tenant scoping keys and feedId", async () => {
    mocks.findFirst.mockResolvedValue(null);

    const result = await getFeedDetail(clerkOrgId, organisationId, feedId);

    expect(result.ok).toBe(false);
    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          clerk_org_id: clerkOrgId,
          id: feedId,
          organisation_id: organisationId,
        },
      })
    );
  });
});
