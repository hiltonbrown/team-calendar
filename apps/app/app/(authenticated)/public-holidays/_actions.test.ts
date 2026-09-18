import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addCustomHoliday: vi.fn(),
  currentUser: vi.fn(),
  deleteCustomHoliday: vi.fn(),
  getActiveOrgContext: vi.fn(),
  importForJurisdiction: vi.fn(),
  requireRole: vi.fn(),
  restoreHoliday: vi.fn(),
  revalidatePath: vi.fn(),
  suppressHoliday: vi.fn(),
}));

vi.mock("@repo/auth/helpers", () => ({
  requireRole: mocks.requireRole,
}));
vi.mock("@repo/auth/server", () => ({
  currentUser: mocks.currentUser,
}));
vi.mock("@repo/availability", () => ({
  addCustomHoliday: mocks.addCustomHoliday,
  deleteCustomHoliday: mocks.deleteCustomHoliday,
  importForJurisdiction: mocks.importForJurisdiction,
  restoreHoliday: mocks.restoreHoliday,
  suppressHoliday: mocks.suppressHoliday,
}));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));
vi.mock("@/lib/server/get-active-org-context", () => ({
  getActiveOrgContext: mocks.getActiveOrgContext,
}));

const {
  addCustomHolidayAction,
  deleteCustomHolidayAction,
  importFromSourceAction,
  restoreHolidayAction,
  suppressHolidayAction,
} = await import("./_actions");

const organisationId = "00000000-0000-4000-8000-000000000001";
const holidayId = "00000000-0000-4000-8000-000000000002";
const clerkOrgId = "org_123";
const userId = "user_456";

describe("public-holidays server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue(true);
    mocks.currentUser.mockResolvedValue({ id: userId });
    mocks.getActiveOrgContext.mockResolvedValue({
      ok: true,
      value: { clerkOrgId, organisationId },
    });
    mocks.importForJurisdiction.mockResolvedValue({
      ok: true,
      value: { imported: 5 },
    });
    mocks.addCustomHoliday.mockResolvedValue({
      ok: true,
      value: { id: holidayId },
    });
    mocks.suppressHoliday.mockResolvedValue({
      ok: true,
      value: { id: holidayId },
    });
    mocks.restoreHoliday.mockResolvedValue({
      ok: true,
      value: { id: holidayId },
    });
    mocks.deleteCustomHoliday.mockResolvedValue({
      ok: true,
      value: { id: holidayId },
    });
  });

  describe("baseline authorization and scoping tests", () => {
    it("rejects unauthenticated callers", async () => {
      mocks.currentUser.mockResolvedValue(null);

      const result = await importFromSourceAction({
        countryCode: "AU",
        organisationId,
        regionCode: "NSW",
        year: 2026,
      });

      expect(result).toEqual({
        error: "You need to sign in again.",
        ok: false,
      });
      expect(mocks.importForJurisdiction).not.toHaveBeenCalled();
    });

    it("rejects callers without org:admin role", async () => {
      mocks.requireRole.mockResolvedValue(false);

      const result = await suppressHolidayAction({ holidayId, organisationId });

      expect(result).toEqual({ error: "Permission denied", ok: false });
      expect(mocks.suppressHoliday).not.toHaveBeenCalled();
    });

    it("allows owners to manage holidays", async () => {
      mocks.requireRole.mockImplementation(async (role: string) =>
        Promise.resolve(role === "org:owner")
      );

      const result = await suppressHolidayAction({ holidayId, organisationId });

      expect(result).toEqual({ ok: true, value: { id: holidayId } });
      expect(mocks.requireRole).toHaveBeenNthCalledWith(1, "org:admin");
      expect(mocks.requireRole).toHaveBeenNthCalledWith(2, "org:owner");
    });

    it("rejects malformed inputs", async () => {
      const result = await importFromSourceAction({
        countryCode: "INVALID", // length !== 2
        organisationId,
        regionCode: "NSW",
        year: 2026,
      });

      expect(result.ok).toBe(false);
      expect(mocks.importForJurisdiction).not.toHaveBeenCalled();
    });

    it("scopes actions to clerkOrgId and organisationId", async () => {
      await importFromSourceAction({
        countryCode: "AU",
        organisationId,
        regionCode: "NSW",
        year: 2026,
      });

      expect(mocks.importForJurisdiction).toHaveBeenCalledWith({
        clerkOrgId,
        countryCode: "AU",
        organisationId,
        regionCode: "NSW",
        userId,
        year: 2026,
      });
    });
  });

  describe("action specific functionality", () => {
    it("addCustomHolidayAction passes parameters to domain service and revalidates", async () => {
      const date = new Date("2026-12-25");
      const result = await addCustomHolidayAction({
        appliesToAllJurisdictions: true,
        date,
        jurisdictionId: null,
        name: "Company Day Off",
        organisationId,
        recursAnnually: true,
      });

      expect(result).toEqual({ ok: true, value: { id: holidayId } });
      expect(mocks.addCustomHoliday).toHaveBeenCalledWith(
        expect.objectContaining({
          appliesToAllJurisdictions: true,
          clerkOrgId,
          name: "Company Day Off",
          organisationId,
          userId,
        })
      );
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/public-holidays");
    });

    it("restoreHolidayAction and deleteCustomHolidayAction call service and revalidate paths", async () => {
      const resRestore = await restoreHolidayAction({
        holidayId,
        organisationId,
      });
      expect(resRestore).toEqual({ ok: true, value: { id: holidayId } });
      expect(mocks.restoreHoliday).toHaveBeenCalledWith(
        clerkOrgId,
        organisationId,
        holidayId,
        userId
      );

      const resDelete = await deleteCustomHolidayAction({
        holidayId,
        organisationId,
      });
      expect(resDelete).toEqual({ ok: true, value: { id: holidayId } });
      expect(mocks.deleteCustomHoliday).toHaveBeenCalledWith(
        clerkOrgId,
        organisationId,
        holidayId
      );
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/public-holidays");
    });
  });
});
