import type { AccountId, OrganisationId } from "@repo/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTenantResult as withTestTenantResult } from "../tenant-db";
import { tenantTestAccount } from "../test-fixtures/tenant-scope";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
}));

vi.mock("../tenant-client", () => ({
  referenceDatabase: {
    $transaction: async (callback: (db: unknown) => Promise<unknown>) =>
      callback({
        $queryRaw: async () => [],
        ...{
          person: {
            findMany: mocks.findMany,
          },
        },
      }),
  },
}));

const { listPeopleForOrganisation } = await import("./people");

describe("people queries", () => {
  const accountId = "org_test_people" as AccountId;
  const organisationId =
    "44444444-4444-4444-8444-444444444444" as OrganisationId;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listPeopleForOrganisation carries account_id and organisation_id", async () => {
    mocks.findMany.mockResolvedValue([]);

    const result = await withTestTenantResult(
      tenantTestAccount(accountId),
      (db) =>
        listPeopleForOrganisation(accountId, organisationId, undefined, db)
    );

    expect(result).toEqual({ ok: true, value: [] });
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          account_id: accountId,
          organisation_id: organisationId,
        }),
      })
    );
  });
});
