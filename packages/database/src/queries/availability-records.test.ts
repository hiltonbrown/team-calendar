import type { ClerkOrgId, OrganisationId } from "@repo/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTenantResult as withTestTenantResult } from "../tenant-db";
import { tenantTestAccount } from "../test-fixtures/tenant-scope";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("../tenant-client", () => ({
  referenceDatabase: {
    $transaction: async (callback: (db: unknown) => Promise<unknown>) =>
      callback({
        $queryRaw: async () => [],
        ...{
          availabilityRecord: {
            findFirst: mocks.findFirst,
            findMany: mocks.findMany,
          },
        },
      }),
  },
}));

const { listAvailabilityForCalendar } = await import("./availability-records");

describe("availability-records queries", () => {
  const clerkOrgId = "org_test_avail" as ClerkOrgId;
  const organisationId =
    "11111111-1111-4111-8111-111111111111" as OrganisationId;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listAvailabilityForCalendar enforces tenant scoping and returns Result", async () => {
    mocks.findMany.mockResolvedValue([]);

    const startDate = new Date("2026-08-01");
    const endDate = new Date("2026-08-31");

    const result = await withTestTenantResult(
      tenantTestAccount(clerkOrgId),
      (db) =>
        listAvailabilityForCalendar(
          clerkOrgId,
          organisationId,
          {
            endDate,
            startDate,
          },
          undefined,
          db
        )
    );

    expect(result).toEqual({ ok: true, value: [] });
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clerk_org_id: clerkOrgId,
          organisation_id: organisationId,
        }),
      })
    );
  });
});
