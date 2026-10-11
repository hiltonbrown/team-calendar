import type { ClerkOrgId, OrganisationId } from "@repo/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
}));

vi.mock("../tenant-client", () => ({
  tenantDatabase: () => ({
    person: {
      findMany: mocks.findMany,
    },
  }),
}));

const { listPeopleForOrganisation } = await import("./people");

describe("people queries", () => {
  const clerkOrgId = "org_test_people" as ClerkOrgId;
  const organisationId =
    "44444444-4444-4444-8444-444444444444" as OrganisationId;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listPeopleForOrganisation carries clerk_org_id and organisation_id", async () => {
    mocks.findMany.mockResolvedValue([]);

    const result = await listPeopleForOrganisation(clerkOrgId, organisationId);

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
