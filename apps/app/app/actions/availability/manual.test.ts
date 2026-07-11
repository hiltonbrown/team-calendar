import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  archiveManualAvailability: vi.fn(),
  auth: vi.fn(),
  createManualAvailability: vi.fn(),
  currentUser: vi.fn(),
  getActiveOrgContext: vi.fn(),
  revalidatePath: vi.fn(),
  updateManualAvailability: vi.fn(),
}));

vi.mock("@repo/auth/server", () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
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
    mocks.auth.mockResolvedValue({
      orgId: "org_clerk_123",
      orgRole: "org:manager",
    });
    mocks.currentUser.mockResolvedValue({ id: "user_123" });
    mocks.getActiveOrgContext.mockResolvedValue({
      ok: true,
      value: {
        clerkOrgId: "org_clerk_123",
        organisationId: "22222222-2222-4222-a222-222222222222",
      },
    });
    mocks.createManualAvailability.mockResolvedValue({
      ok: true,
      value: { id: "44444444-4444-4444-8444-444444444444" },
    });
  });

  it("passes orgRole through to the availability service", async () => {
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
      ok: true,
      id: "44444444-4444-4444-8444-444444444444",
    });
    expect(mocks.createManualAvailability).toHaveBeenCalledWith(
      {
        clerkOrgId: "org_clerk_123",
        organisationId: "22222222-2222-4222-a222-222222222222",
      },
      expect.objectContaining({
        personId: "11111111-1111-4111-a111-111111111111",
        title: "WFH",
      }),
      {
        orgRole: "org:manager",
        userId: "user_123",
      }
    );
  });
});
