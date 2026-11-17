import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  archiveManualAvailability: vi.fn(),
  createManualAvailability: vi.fn(),
  getActiveOrgContext: vi.fn(),
  getCurrentUser: vi.fn(),
  getSession: vi.fn(),
  revalidatePath: vi.fn(),
  updateManualAvailability: vi.fn(),
}));

vi.mock("@repo/auth/server", () => ({
  getCurrentUser: mocks.getCurrentUser,
  getSession: mocks.getSession,
}));
vi.mock("@repo/availability", () => ({
  archiveManualAvailability: mocks.archiveManualAvailability,
  createManualAvailability: mocks.createManualAvailability,
  updateManualAvailability: mocks.updateManualAvailability,
}));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));
vi.mock("@/lib/server/get-active-org-context", () => ({
  getActiveOrgContext: mocks.getActiveOrgContext,
}));

const { createManualAvailabilityAction } = await import("./manual");

describe("manual availability actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      accountId: "org_account_123",
      role: "manager",
    });
    mocks.getCurrentUser.mockResolvedValue({ id: "user_123" });
    mocks.getActiveOrgContext.mockResolvedValue({
      ok: true,
      value: {
        accountId: "org_account_123",
        organisationId: "22222222-2222-4222-a222-222222222222",
      },
    });
    mocks.createManualAvailability.mockResolvedValue({
      ok: true,
      value: { id: "44444444-4444-4444-8444-444444444444" },
    });
  });

  it("passes role through to the availability service", async () => {
    const result = await createManualAvailabilityAction({
      allDay: false,
      contactability: "contactable",
      endsAt: "2026-07-01T17:00:00.000Z",
      includeInFeed: true,
      notesInternal: "",
      organisationId: "22222222-2222-4222-a222-222222222222",
      personId: "11111111-1111-4111-a111-111111111111",
      preferredContactMethod: "",
      privacyMode: "named",
      recordType: "wfh",
      startsAt: "2026-07-01T09:00:00.000Z",
      title: "WFH",
      workingLocation: "",
    });

    expect(result).toEqual({
      id: "44444444-4444-4444-8444-444444444444",
      ok: true,
    });
    expect(mocks.createManualAvailability).toHaveBeenCalledWith(
      {
        accountId: "org_account_123",
        organisationId: "22222222-2222-4222-a222-222222222222",
      },
      expect.objectContaining({
        personId: "11111111-1111-4111-a111-111111111111",
        title: "WFH",
      }),
      {
        role: "manager",
        userId: "user_123",
      },
      expect.any(Object)
    );
  });
});

vi.mock("@repo/database/tenant-client", () => ({
  referenceDatabase: {
    $transaction: (run: (db: unknown) => Promise<unknown>) =>
      run({
        $executeRaw: vi.fn(() => Promise.resolve(1)),
        $queryRaw: vi.fn(() => Promise.resolve([])),
        organisation: {
          findFirst: vi.fn(() =>
            Promise.resolve({ id: "22222222-2222-4222-a222-222222222222" })
          ),
        },
      }),
  },
}));
vi.mock("@repo/database", async () => ({
  ...(await vi.importActual<typeof import("@repo/database/tenant-db")>(
    "@repo/database/tenant-db"
  )),
}));
