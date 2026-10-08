import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  personFindFirst: vi.fn(),
}));
vi.mock("@repo/database", () => ({
  database: {
    person: { findFirst: mocks.personFindFirst },
  },
}));
const { resolveXeroEmployeeId } = await import("./resolve-employee");
const xeroConnection = {
  accessToken: "access-token",
  clerk_org_id: "org_1",
  deadline: { expiresAtMs: Date.now() + 120_000 },
  id: "tenant_1",
  organisation_id: "00000000-0000-4000-8000-000000000001",
  payroll_region: "AU" as const,
  xero_tenant_id: "xero-tenant-1",
};
describe("resolveXeroEmployeeId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("returns the synced Xero employee ID", async () => {
    mocks.personFindFirst.mockResolvedValueOnce({
      source_person_key: "employee-1",
      source_system: "XERO",
    });
    const result = await resolveXeroEmployeeId({
      personId: "00000000-0000-4000-8000-000000000011",
      xeroConnection,
    });
    expect(result).toEqual({ ok: true, value: "employee-1" });
    expect(mocks.personFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clerk_org_id: "org_1",
          organisation_id: xeroConnection.organisation_id,
        }),
      })
    );
  });
  it("returns missing_mapping when the person is not Xero-synced", async () => {
    mocks.personFindFirst.mockResolvedValueOnce({
      source_person_key: null,
      source_system: "MANUAL",
    });
    const result = await resolveXeroEmployeeId({
      personId: "00000000-0000-4000-8000-000000000011",
      xeroConnection,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("missing_mapping");
    }
  });
  it("rejects cross-tenant people", async () => {
    mocks.personFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: "00000000-0000-4000-8000-000000000011",
    });
    const result = await resolveXeroEmployeeId({
      personId: "00000000-0000-4000-8000-000000000011",
      xeroConnection,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("person_not_in_tenant");
    }
  });
});
