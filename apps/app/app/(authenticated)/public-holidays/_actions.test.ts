import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addCustomHoliday: vi.fn(),
  currentUser: vi.fn(),
  deleteCustomHoliday: vi.fn(),
  getActiveOrgContext: vi.fn(),
  hidePublicHoliday: vi.fn(),
  requireRole: vi.fn(),
  restorePublicHoliday: vi.fn(),
  revalidatePath: vi.fn(),
  setLocalHolidayEnabled: vi.fn(),
  setPublicHolidayClassification: vi.fn(),
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
  hidePublicHoliday: mocks.hidePublicHoliday,
  restorePublicHoliday: mocks.restorePublicHoliday,
  setLocalHolidayEnabled: mocks.setLocalHolidayEnabled,
  setPublicHolidayClassification: mocks.setPublicHolidayClassification,
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
  hideHolidayAction,
  restoreHolidayAction,
  setHolidayClassificationAction,
  setLocalHolidayEnabledAction,
} = await import("./_actions");

const organisationId = "00000000-0000-4000-8000-000000000001";
const holidayId = "00000000-0000-4000-8000-000000000002";
const locationId = "00000000-0000-4000-8000-000000000003";
const clerkOrgId = "org_123";
const userId = "user_456";
const holidayKey = "au-qld-2026-08-12-royal-queensland-show";
const preferenceResult = {
  ok: true,
  value: { holidayName: "Royal Queensland Show", locationName: "Brisbane" },
};

describe("public-holidays server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockImplementation((role: string) =>
      Promise.resolve(role === "org:admin")
    );
    mocks.currentUser.mockResolvedValue({ id: userId });
    mocks.getActiveOrgContext.mockResolvedValue({
      ok: true,
      value: { clerkOrgId, organisationId },
    });
    mocks.addCustomHoliday.mockResolvedValue({
      ok: true,
      value: { id: holidayId },
    });
    mocks.deleteCustomHoliday.mockResolvedValue({
      ok: true,
      value: { id: holidayId },
    });
    mocks.hidePublicHoliday.mockResolvedValue({
      ok: true,
      value: { holidayName: "Christmas Day", locationName: null },
    });
    mocks.restorePublicHoliday.mockResolvedValue(preferenceResult);
    mocks.setLocalHolidayEnabled.mockResolvedValue(preferenceResult);
    mocks.setPublicHolidayClassification.mockResolvedValue(preferenceResult);
  });

  describe("authorisation and scoping", () => {
    it("rejects unauthenticated callers", async () => {
      mocks.currentUser.mockResolvedValue(null);

      const result = await hideHolidayAction({ holidayKey, organisationId });

      expect(result).toEqual({
        error: "You need to sign in again.",
        ok: false,
      });
      expect(mocks.hidePublicHoliday).not.toHaveBeenCalled();
    });

    it("rejects callers without an admin or owner role", async () => {
      mocks.requireRole.mockResolvedValue(false);

      const result = await hideHolidayAction({ holidayKey, organisationId });

      expect(result).toEqual({ error: "Permission denied", ok: false });
      expect(mocks.hidePublicHoliday).not.toHaveBeenCalled();
    });

    it("passes the owner role to the preference service", async () => {
      mocks.requireRole.mockImplementation((role: string) =>
        Promise.resolve(role === "org:owner")
      );

      await hideHolidayAction({ holidayKey, organisationId });

      expect(mocks.hidePublicHoliday).toHaveBeenCalledWith(
        expect.objectContaining({ actingRole: "owner" })
      );
    });

    it("rejects malformed inputs before checking access", async () => {
      const result = await setLocalHolidayEnabledAction({
        enabled: true,
        holidayKey,
        locationId: "not-a-uuid",
        organisationId,
      });

      expect(result.ok).toBe(false);
      expect(mocks.requireRole).not.toHaveBeenCalled();
      expect(mocks.setLocalHolidayEnabled).not.toHaveBeenCalled();
    });

    it("hides a holiday organisation-wide within the active tenant", async () => {
      const result = await hideHolidayAction({ holidayKey, organisationId });

      expect(result).toEqual({
        ok: true,
        value: { message: "Christmas Day hidden for all locations." },
      });
      expect(mocks.hidePublicHoliday).toHaveBeenCalledWith({
        actingRole: "admin",
        actingUserId: userId,
        clerkOrgId,
        holidayKey,
        locationId: null,
        organisationId,
      });
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/public-holidays");
    });
  });

  describe("custom holidays", () => {
    it("adds a custom holiday for a country and region", async () => {
      const result = await addCustomHolidayAction({
        appliesToAllJurisdictions: false,
        countryCode: "AU",
        date: new Date("2026-12-28"),
        name: "Company Day Off",
        organisationId,
        regionCode: "QLD",
      });

      expect(result).toEqual({
        ok: true,
        value: { id: holidayId, message: "Company Day Off added." },
      });
      expect(mocks.addCustomHoliday).toHaveBeenCalledWith(
        expect.objectContaining({
          appliesToAllJurisdictions: false,
          clerkOrgId,
          countryCode: "AU",
          name: "Company Day Off",
          organisationId,
          regionCode: "QLD",
          userId,
        })
      );
    });

    it("returns the service error when adding fails", async () => {
      mocks.addCustomHoliday.mockResolvedValue({
        error: { code: "conflict", message: "Already exists" },
        ok: false,
      });

      const result = await addCustomHolidayAction({
        appliesToAllJurisdictions: true,
        countryCode: null,
        date: new Date("2026-12-28"),
        name: "Company Day Off",
        organisationId,
        regionCode: null,
      });

      expect(result).toEqual({ error: "Already exists", ok: false });
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    });

    it("deletes a custom holiday", async () => {
      const result = await deleteCustomHolidayAction({
        holidayId,
        name: "Company Day Off",
        organisationId,
      });

      expect(result).toEqual({
        ok: true,
        value: { message: "Company Day Off deleted." },
      });
      expect(mocks.deleteCustomHoliday).toHaveBeenCalledWith(
        clerkOrgId,
        organisationId,
        holidayId
      );
    });
  });

  describe("location preferences", () => {
    it("restores a holiday for one location", async () => {
      const result = await restoreHolidayAction({
        holidayKey,
        locationId,
        organisationId,
      });

      expect(result).toEqual({
        ok: true,
        value: { message: "Royal Queensland Show restored for Brisbane." },
      });
      expect(mocks.restorePublicHoliday).toHaveBeenCalledWith(
        expect.objectContaining({ holidayKey, locationId })
      );
    });

    it("marks a holiday as a working day for a location", async () => {
      const result = await setHolidayClassificationAction({
        classification: "working",
        holidayKey,
        locationId,
        organisationId,
      });

      expect(result).toEqual({
        ok: true,
        value: {
          message: "Royal Queensland Show is now a working day for Brisbane.",
        },
      });
    });

    it("switches a local day on for a location", async () => {
      const result = await setLocalHolidayEnabledAction({
        enabled: true,
        holidayKey,
        locationId,
        organisationId,
      });

      expect(result).toEqual({
        ok: true,
        value: { message: "Royal Queensland Show switched on for Brisbane." },
      });
      expect(mocks.setLocalHolidayEnabled).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true, holidayKey, locationId })
      );
    });
  });
});
