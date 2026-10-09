import { vi } from "vitest";

vi.mock("server-only", () => ({}));

const db = vi.hoisted(() => {
  const client = {
    auditEvent: { create: vi.fn() },
    location: { findFirst: vi.fn() },
    publicHoliday: { findFirst: vi.fn() },
    publicHolidayPreference: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  };
  return {
    ...client,
    $transaction: vi.fn(async (run: (tx: typeof client) => Promise<unknown>) =>
      run(client)
    ),
  };
});

vi.mock("@repo/database", () => ({
  database: db,
  scopedQuery: vi.fn((clerkOrgId: string, organisationId: string) => ({
    clerk_org_id: clerkOrgId,
    organisation_id: organisationId,
  })),
}));

vi.mock("@repo/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/core")>()),
  findReferenceHoliday: vi.fn((id: string) => {
    if (id === "au-qld-2026-08-12-royal-queensland-show") {
      return { id, kind: "local", name: "Royal Queensland Show" };
    }
    if (id === "au-national-2026-12-25-christmas-day") {
      return { id, kind: "public", name: "Christmas Day" };
    }
    return null;
  }),
}));

import { beforeEach, describe, expect, it } from "vitest";
import {
  hidePublicHoliday,
  restorePublicHoliday,
  setLocalHolidayEnabled,
  setPublicHolidayClassification,
} from "./holiday-preferences";

const base = {
  actingRole: "admin" as const,
  actingUserId: "user_1",
  clerkOrgId: "org_a",
  organisationId: "11111111-1111-4111-8111-111111111111",
};
const LOCATION = "22222222-2222-4222-8222-222222222222";
const CHRISTMAS = "au-national-2026-12-25-christmas-day";
const SHOW = "au-qld-2026-08-12-royal-queensland-show";

describe("holiday preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.location.findFirst.mockResolvedValue({ id: LOCATION, name: "Brisbane" });
    db.publicHolidayPreference.findFirst.mockResolvedValue(null);
  });

  it("rejects people who are not owners or admins", async () => {
    const result = await hidePublicHoliday({
      ...base,
      actingRole: "manager",
      holidayKey: CHRISTMAS,
      locationId: null,
    });
    expect(result).toMatchObject({
      error: { code: "not_authorised" },
      ok: false,
    });
    expect(db.publicHolidayPreference.create).not.toHaveBeenCalled();
  });

  it("hides a holiday organisation-wide and records an audit event in the same transaction", async () => {
    const result = await hidePublicHoliday({
      ...base,
      holidayKey: CHRISTMAS,
      locationId: null,
    });
    expect(result).toEqual({
      ok: true,
      value: { holidayName: "Christmas Day", locationName: null },
    });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.publicHolidayPreference.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clerk_org_id: "org_a",
        holiday_key: CHRISTMAS,
        location_id: null,
        organisation_id: base.organisationId,
        setting: "hidden",
      }),
    });
    expect(db.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "public_holidays.hidden",
        entity_id: CHRISTMAS,
      }),
    });
  });

  it("updates an existing preference instead of duplicating it", async () => {
    db.publicHolidayPreference.findFirst.mockResolvedValue({
      id: "pref-1",
      setting: "non_working",
    });
    await setPublicHolidayClassification({
      ...base,
      classification: "working",
      holidayKey: CHRISTMAS,
      locationId: LOCATION,
    });
    expect(db.publicHolidayPreference.update).toHaveBeenCalledWith({
      data: expect.objectContaining({ setting: "working" }),
      where: { id: "pref-1" },
    });
    expect(db.publicHolidayPreference.create).not.toHaveBeenCalled();
    expect(db.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "public_holidays.classification_changed",
      }),
    });
  });

  it("removes a location row when the classification returns to the default", async () => {
    db.publicHolidayPreference.findFirst.mockResolvedValue({
      id: "pref-1",
      setting: "working",
    });
    await setPublicHolidayClassification({
      ...base,
      classification: "non_working",
      holidayKey: CHRISTMAS,
      locationId: LOCATION,
    });
    expect(db.publicHolidayPreference.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        holiday_key: CHRISTMAS,
        location_id: LOCATION,
      }),
    });
    expect(db.publicHolidayPreference.update).not.toHaveBeenCalled();
    expect(db.publicHolidayPreference.create).not.toHaveBeenCalled();
    expect(db.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "public_holidays.classification_changed",
      }),
    });
  });

  it("rejects unknown holiday keys and custom holidays from another organisation", async () => {
    expect(
      await hidePublicHoliday({
        ...base,
        holidayKey: "au-qld-2099-01-01-nope",
        locationId: null,
      })
    ).toMatchObject({
      error: { code: "validation_error" },
      ok: false,
    });

    db.publicHoliday.findFirst.mockResolvedValue(null);
    const custom = await hidePublicHoliday({
      ...base,
      holidayKey: "custom:33333333-3333-4333-8333-333333333333",
      locationId: null,
    });
    expect(custom).toMatchObject({
      error: { code: "validation_error" },
      ok: false,
    });
    expect(db.publicHoliday.findFirst.mock.calls[0]?.[0]?.where).toMatchObject({
      clerk_org_id: "org_a",
      organisation_id: base.organisationId,
      source: "manual",
    });
  });

  it("rejects a location outside the organisation", async () => {
    db.location.findFirst.mockResolvedValue(null);
    const result = await setPublicHolidayClassification({
      ...base,
      classification: "working",
      holidayKey: CHRISTMAS,
      locationId: LOCATION,
    });
    expect(result).toMatchObject({
      error: { code: "validation_error" },
      ok: false,
    });
    expect(db.location.findFirst.mock.calls[0]?.[0]?.where).toMatchObject({
      clerk_org_id: "org_a",
      id: LOCATION,
      organisation_id: base.organisationId,
    });
  });

  it("switches local days on and off per location only", async () => {
    const on = await setLocalHolidayEnabled({
      ...base,
      enabled: true,
      holidayKey: SHOW,
      locationId: LOCATION,
    });
    expect(on).toEqual({
      ok: true,
      value: { holidayName: "Royal Queensland Show", locationName: "Brisbane" },
    });
    expect(db.publicHolidayPreference.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        location_id: LOCATION,
        setting: "non_working",
      }),
    });
    expect(db.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "public_holidays.local_day_enabled",
      }),
    });

    await setLocalHolidayEnabled({
      ...base,
      enabled: false,
      holidayKey: SHOW,
      locationId: LOCATION,
    });
    expect(db.publicHolidayPreference.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        holiday_key: SHOW,
        location_id: LOCATION,
        organisation_id: base.organisationId,
      }),
    });

    const notLocal = await setLocalHolidayEnabled({
      ...base,
      enabled: true,
      holidayKey: CHRISTMAS,
      locationId: LOCATION,
    });
    expect(notLocal).toMatchObject({
      error: { code: "validation_error" },
      ok: false,
    });
  });

  it("restores by removing the preference at that scope", async () => {
    await restorePublicHoliday({
      ...base,
      holidayKey: CHRISTMAS,
      locationId: null,
    });
    expect(db.publicHolidayPreference.deleteMany).toHaveBeenCalledWith({
      where: {
        clerk_org_id: "org_a",
        holiday_key: CHRISTMAS,
        location_id: null,
        organisation_id: base.organisationId,
      },
    });
    expect(db.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "public_holidays.restored" }),
    });
  });
});
