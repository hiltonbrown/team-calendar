import { vi } from "vitest";
import { referenceDatabase } from "../../../database/src/tenant-client";
import { withTenantResult as withTestTenantResult } from "../../../database/src/tenant-db";
import { tenantTestAccount } from "../../../database/src/test-fixtures/tenant-scope";

vi.mock("server-only", () => ({}));

const db = vi.hoisted(() => {
  const client = {
    auditEvent: { create: vi.fn() },
    location: { findFirst: vi.fn() },
    publicHoliday: { findFirst: vi.fn() },
    publicHolidayPreference: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  return {
    ...client,
    $transaction: vi.fn(async (run: (tx: typeof client) => Promise<unknown>) =>
      run(client)
    ),
  };
});

vi.mock("../../../database/src/tenant-client", () => ({
  referenceDatabase: {
    $transaction: vi.fn(async (run: (db: unknown) => Promise<unknown>) =>
      run(buildTestDatabase())
    ),
  },
}));
vi.mock("@repo/database", async () => ({
  ...(await vi.importActual<typeof import("../../../database/src/tenant-db")>(
    "../../../database/src/tenant-db"
  )),

  scopedQuery: vi.fn((clerkOrgId: string, organisationId: string) => ({
    clerk_org_id: clerkOrgId,
    organisation_id: organisationId,
  })),
}));
function buildTestDatabase() {
  // Selected delegates are fakes; scope ownership and commit effects use the real wrapper.
  return {
    $executeRaw: vi.fn(async () => 1),
    $queryRaw: vi.fn(async () => []),
    ...db,
  };
}

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
    db.publicHolidayPreference.createMany.mockResolvedValue({ count: 1 });
    db.publicHolidayPreference.updateMany.mockResolvedValue({ count: 1 });
  });

  it("rejects people who are not owners or admins", async () => {
    const result = await withTestTenantResult(
      tenantTestAccount({
        ...base,
        actingRole: "manager",
        holidayKey: CHRISTMAS,
        locationId: null,
      }),
      (tenantDb) =>
        hidePublicHoliday(
          {
            ...base,
            actingRole: "manager",
            holidayKey: CHRISTMAS,
            locationId: null,
          },
          tenantDb
        )
    );
    expect(result).toMatchObject({
      error: { code: "not_authorised" },
      ok: false,
    });
    expect(db.publicHolidayPreference.createMany).not.toHaveBeenCalled();
  });

  it("hides a holiday organisation-wide and records an audit event in the same transaction", async () => {
    const result = await withTestTenantResult(
      tenantTestAccount({
        ...base,
        holidayKey: CHRISTMAS,
        locationId: null,
      }),
      (tenantDb) =>
        hidePublicHoliday(
          {
            ...base,
            holidayKey: CHRISTMAS,
            locationId: null,
          },
          tenantDb
        )
    );
    expect(result).toEqual({
      ok: true,
      value: { holidayName: "Christmas Day", locationName: null },
    });
    expect(referenceDatabase.$transaction).toHaveBeenCalledTimes(1);
    expect(db.publicHolidayPreference.createMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clerk_org_id: "org_a",
        holiday_key: CHRISTMAS,
        location_id: null,
        organisation_id: base.organisationId,
        setting: "hidden",
      }),
      skipDuplicates: true,
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
    await withTestTenantResult(
      tenantTestAccount({
        ...base,
        classification: "working",
        holidayKey: CHRISTMAS,
        locationId: LOCATION,
      }),
      (tenantDb) =>
        setPublicHolidayClassification(
          {
            ...base,
            classification: "working",
            holidayKey: CHRISTMAS,
            locationId: LOCATION,
          },
          tenantDb
        )
    );
    expect(db.publicHolidayPreference.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({ setting: "working" }),
      where: expect.objectContaining({
        clerk_org_id: base.clerkOrgId,
        id: "pref-1",
        organisation_id: base.organisationId,
      }),
    });
    expect(db.publicHolidayPreference.createMany).not.toHaveBeenCalled();
    expect(db.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "public_holidays.classification_changed",
      }),
    });
  });

  it("updates the concurrent winner without aborting the tenant transaction", async () => {
    db.publicHolidayPreference.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "pref-race", setting: "hidden" });
    db.publicHolidayPreference.createMany.mockResolvedValueOnce({ count: 0 });

    const result = await withTestTenantResult(
      tenantTestAccount({
        ...base,
        holidayKey: CHRISTMAS,
        locationId: null,
      }),
      (tenantDb) =>
        hidePublicHoliday(
          {
            ...base,
            holidayKey: CHRISTMAS,
            locationId: null,
          },
          tenantDb
        )
    );

    expect(result).toMatchObject({ ok: true });
    expect(referenceDatabase.$transaction).toHaveBeenCalledTimes(1);
    expect(db.publicHolidayPreference.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({ setting: "hidden" }),
      where: expect.objectContaining({
        clerk_org_id: base.clerkOrgId,
        id: "pref-race",
        organisation_id: base.organisationId,
      }),
    });
  });

  it("removes a location row when the classification returns to the default", async () => {
    db.publicHolidayPreference.findFirst.mockResolvedValue({
      id: "pref-1",
      setting: "working",
    });
    await withTestTenantResult(
      tenantTestAccount({
        ...base,
        classification: "non_working",
        holidayKey: CHRISTMAS,
        locationId: LOCATION,
      }),
      (tenantDb) =>
        setPublicHolidayClassification(
          {
            ...base,
            classification: "non_working",
            holidayKey: CHRISTMAS,
            locationId: LOCATION,
          },
          tenantDb
        )
    );
    expect(db.publicHolidayPreference.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        holiday_key: CHRISTMAS,
        location_id: LOCATION,
      }),
    });
    expect(db.publicHolidayPreference.updateMany).not.toHaveBeenCalled();
    expect(db.publicHolidayPreference.createMany).not.toHaveBeenCalled();
    expect(db.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "public_holidays.classification_changed",
      }),
    });
  });

  it("rejects unknown holiday keys and custom holidays from another organisation", async () => {
    expect(
      await withTestTenantResult(
        tenantTestAccount({
          ...base,
          holidayKey: "au-qld-2099-01-01-nope",
          locationId: null,
        }),
        (tenantDb) =>
          hidePublicHoliday(
            {
              ...base,
              holidayKey: "au-qld-2099-01-01-nope",
              locationId: null,
            },
            tenantDb
          )
      )
    ).toMatchObject({
      error: { code: "validation_error" },
      ok: false,
    });

    db.publicHoliday.findFirst.mockResolvedValue(null);
    const custom = await withTestTenantResult(
      tenantTestAccount({
        ...base,
        holidayKey: "custom:33333333-3333-4333-8333-333333333333",
        locationId: null,
      }),
      (tenantDb) =>
        hidePublicHoliday(
          {
            ...base,
            holidayKey: "custom:33333333-3333-4333-8333-333333333333",
            locationId: null,
          },
          tenantDb
        )
    );
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
    const result = await withTestTenantResult(
      tenantTestAccount({
        ...base,
        classification: "working",
        holidayKey: CHRISTMAS,
        locationId: LOCATION,
      }),
      (tenantDb) =>
        setPublicHolidayClassification(
          {
            ...base,
            classification: "working",
            holidayKey: CHRISTMAS,
            locationId: LOCATION,
          },
          tenantDb
        )
    );
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
    const on = await withTestTenantResult(
      tenantTestAccount({
        ...base,
        enabled: true,
        holidayKey: SHOW,
        locationId: LOCATION,
      }),
      (tenantDb) =>
        setLocalHolidayEnabled(
          {
            ...base,
            enabled: true,
            holidayKey: SHOW,
            locationId: LOCATION,
          },
          tenantDb
        )
    );
    expect(on).toEqual({
      ok: true,
      value: { holidayName: "Royal Queensland Show", locationName: "Brisbane" },
    });
    expect(db.publicHolidayPreference.createMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        location_id: LOCATION,
        setting: "non_working",
      }),
      skipDuplicates: true,
    });
    expect(db.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "public_holidays.local_day_enabled",
      }),
    });

    await withTestTenantResult(
      tenantTestAccount({
        ...base,
        enabled: false,
        holidayKey: SHOW,
        locationId: LOCATION,
      }),
      (tenantDb) =>
        setLocalHolidayEnabled(
          {
            ...base,
            enabled: false,
            holidayKey: SHOW,
            locationId: LOCATION,
          },
          tenantDb
        )
    );
    expect(db.publicHolidayPreference.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        holiday_key: SHOW,
        location_id: LOCATION,
        organisation_id: base.organisationId,
      }),
    });

    const notLocal = await withTestTenantResult(
      tenantTestAccount({
        ...base,
        enabled: true,
        holidayKey: CHRISTMAS,
        locationId: LOCATION,
      }),
      (tenantDb) =>
        setLocalHolidayEnabled(
          {
            ...base,
            enabled: true,
            holidayKey: CHRISTMAS,
            locationId: LOCATION,
          },
          tenantDb
        )
    );
    expect(notLocal).toMatchObject({
      error: { code: "validation_error" },
      ok: false,
    });
  });

  it("restores by removing the preference at that scope", async () => {
    await withTestTenantResult(
      tenantTestAccount({
        ...base,
        holidayKey: CHRISTMAS,
        locationId: null,
      }),
      (tenantDb) =>
        restorePublicHoliday(
          {
            ...base,
            holidayKey: CHRISTMAS,
            locationId: null,
          },
          tenantDb
        )
    );
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
