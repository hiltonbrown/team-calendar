import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActiveOrgContext: vi.fn(),
  getSession: vi.fn(),
  revalidatePath: vi.fn(),
  updateAccount: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("@repo/auth/server", () => ({
  getSession: mocks.getSession,
}));
vi.mock("@repo/database/tenant-client", () => ({
  referenceDatabase: {
    $transaction: async (
      executeTransaction: (client: unknown) => Promise<unknown>
    ) =>
      executeTransaction({
        $executeRaw: vi.fn(async () => 1),
        $queryRaw: vi.fn(async () => []),
        ...buildTenantTestDatabase(),
      }),
  },
}));
vi.mock("@repo/database", async () => ({
  ...(await vi.importActual<typeof import("@repo/database/tenant-db")>(
    "@repo/database/tenant-db"
  )),
}));
function buildTenantTestDatabase() {
  return {
    organisation: {
      findFirst: vi.fn(() => Promise.resolve({ id: organisationId })),
      updateMany: mocks.updateMany,
    },
  };
}
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));
vi.mock("@/lib/server/get-active-org-context", () => ({
  getActiveOrgContext: mocks.getActiveOrgContext,
}));

const { updateOrg } = await import("./update-org");

const organisationId = "00000000-0000-4000-8000-000000000001";

const validInput = {
  fiscalYearStart: 7,
  locale: "en-AU",
  name: "Acme Restaurants",
  organisationId,
  reportingUnit: "hours",
  timezone: "Australia/Sydney",
  workingHoursPerDay: 7.6,
} as const;

describe("updateOrg", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      accountId: "org_1",
      role: "viewer",
    });
    mocks.getActiveOrgContext.mockResolvedValue({
      ok: true,
      value: { accountId: "org_1", organisationId },
    });
    mocks.updateMany.mockResolvedValue({ count: 1 });

    mocks.updateAccount.mockResolvedValue({});
  });

  it("rejects viewers before touching the database or Clerk", async () => {
    const result = await updateOrg(validInput);

    expect(result.ok).toBe(false);
    expect(mocks.getActiveOrgContext).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("allows admins to update organisation settings", async () => {
    mocks.getSession.mockResolvedValue({
      accountId: "org_1",
      role: "admin",
    });

    const result = await updateOrg(validInput);

    expect(result.ok).toBe(true);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      data: {
        fiscal_year_start: 7,
        locale: "en-AU",
        name: "Acme Restaurants",
        reporting_unit: "hours",
        timezone: "Australia/Sydney",
        working_hours_per_day: 7.6,
      },
      where: { account_id: "org_1", id: organisationId },
    });
    expect(mocks.updateAccount).toHaveBeenCalled();
  });

  it("bails out before updating Clerk when no organisation row matches", async () => {
    mocks.getSession.mockResolvedValue({
      accountId: "org_1",
      role: "admin",
    });
    mocks.updateMany.mockResolvedValue({ count: 0 });

    const result = await updateOrg(validInput);

    expect(result.ok).toBe(false);

    expect(mocks.updateAccount).not.toHaveBeenCalled();
  });
});

vi.mock("@repo/auth/accounts", () => ({
  accountDirectory: {
    inviteMembers: vi.fn(),
    listInvitations: vi.fn(),
    listMembers: vi.fn(),
  },
  updateAccount: mocks.updateAccount,
}));
