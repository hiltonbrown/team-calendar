import { database } from "@repo/database";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  failedRecordCreate: vi.fn(),
  fetchEmployeesForRegion: vi.fn(),
  personFindFirst: vi.fn(),
  personFindMany: vi.fn(),
  personUpdateMany: vi.fn(),
  personUpsert: vi.fn(),
  publishOrganisationNotificationEvent: vi.fn(),
  resolveXeroAccess: vi.fn(),
  scopedTo: vi.fn((scope: { clerkOrgId: string; organisationId: string }) => ({
    clerk_org_id: scope.clerkOrgId,
    organisation_id: scope.organisationId,
  })),
  syncRunCreate: vi.fn(),
  syncRunFindFirst: vi.fn(),
  syncRunUpdateMany: vi.fn(),
  toPlainLanguageMessage: vi.fn(() => "Xero request failed"),
  xeroTenantFindFirst: vi.fn(),
  xeroTenantUpdateMany: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../client", () => ({
  inngest: {
    createFunction: vi.fn(() => ({ id: "sync-xero-people" })),
    send: vi.fn(() => Promise.resolve({ ids: ["event_1"] })),
  },
}));

vi.mock("@repo/database", () => ({
  database: {
    failedRecord: { create: mocks.failedRecordCreate },
    person: {
      findFirst: mocks.personFindFirst,
      findMany: mocks.personFindMany,
      updateMany: mocks.personUpdateMany,
      upsert: mocks.personUpsert,
    },
    syncRun: {
      create: mocks.syncRunCreate,
      findFirst: mocks.syncRunFindFirst,
      updateMany: mocks.syncRunUpdateMany,
    },
    xeroTenant: {
      findFirst: mocks.xeroTenantFindFirst,
      updateMany: mocks.xeroTenantUpdateMany,
    },
  },
  scopedTo: mocks.scopedTo,
}));

vi.mock("@repo/notifications", () => ({
  publishOrganisationNotificationEvent:
    mocks.publishOrganisationNotificationEvent,
}));

vi.mock("@repo/observability/log", () => ({
  log: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("@repo/xero", async () => ({
  classifyXeroFailure: (
    await vi.importActual<typeof import("@repo/xero")>("@repo/xero")
  ).classifyXeroFailure,
  fetchEmployeesForRegion: mocks.fetchEmployeesForRegion,
  resolveXeroAccess: async (scope) => {
    const result = await mocks.resolveXeroAccess(scope);
    if (!result?.ok) {
      return result;
    }
    const tenant = await mocks.xeroTenantFindFirst.mock.results.at(-1)?.value;
    return {
      ok: true,
      value: {
        ...result.value,
        accessToken: "fake-access",
        bindingGeneration: scope.expectedBindingGeneration,
        capability: scope.capability,
        deadline: scope.deadline,
        payrollRegion: tenant.payroll_region,
        tokenVersion: 1,
        xeroTenantDatabaseId: tenant.id,
        xeroTenantId: tenant.xero_tenant_id ?? "fake-tenant",
      },
    };
  },
  toPlainLanguageMessage: mocks.toPlainLanguageMessage,
  toResolvedXeroTenant: (scope, value) => ({
    ...value,
    clerk_org_id: scope.clerkOrgId,
    id: value.xeroTenantDatabaseId,
    organisation_id: scope.organisationId,
    payroll_region: value.payrollRegion,
    xero_tenant_id: value.xeroTenantId,
  }),
}));

import { syncXeroPeople } from "./sync-xero-people";

function buildTenant(region: "AU" | "NZ" | "UK" = "NZ") {
  return {
    clerk_org_id: "org_1",
    id: "00000000-0000-4000-8000-000000000003",
    organisation_id: "00000000-0000-4000-8000-000000000001",
    payroll_region: region,
    sync_paused_at: null,
    xero_connection: {
      access_token_auth_tag: "tag",
      access_token_encrypted: "enc",
      access_token_iv: "iv",
      expires_at: new Date(Date.now() + 3_600_000),
      last_refreshed_at: new Date(),
      revoked_at: null,
      status: "active",
    },
    xero_connection_id: "00000000-0000-4000-8000-000000000002",
    xero_tenant_id: "xt_1",
  };
}

describe("syncXeroPeople unit tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(database, {
      $executeRaw: vi.fn(async () => 1),
      $queryRaw: vi.fn(async () => []),
      $transaction: vi.fn(async (callback) => callback(database)),
    });
    mocks.syncRunFindFirst.mockResolvedValue(null);
    mocks.syncRunCreate.mockResolvedValue({ id: "run_1" });
    mocks.syncRunUpdateMany.mockResolvedValue({ count: 1 });
    mocks.xeroTenantFindFirst.mockResolvedValue(buildTenant("NZ"));
    mocks.resolveXeroAccess.mockResolvedValue({
      ok: true,
      value: { refreshed: false },
    });
    mocks.personFindMany.mockResolvedValue([]);
    mocks.personUpdateMany.mockResolvedValue({ count: 0 });
    mocks.personUpsert.mockResolvedValue({ id: "person_1" });
    mocks.xeroTenantUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("rejects invalid input schema with validation_error", async () => {
    const result = await syncXeroPeople({
      bindingGeneration: 1,
      clerkOrgId: "",
      organisationId: "invalid-uuid",
      xeroTenantId: "invalid-uuid",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("validation_error");
    }
  });

  it("rejects non-object input", async () => {
    const result = await syncXeroPeople(null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("validation_error");
    }
  });

  it("syncs NZ employees and records counts", async () => {
    mocks.xeroTenantFindFirst.mockResolvedValue(buildTenant("NZ"));
    mocks.fetchEmployeesForRegion.mockResolvedValueOnce({
      ok: true,
      value: {
        complete: true,
        employees: [
          {
            email: "aroha@example.co.nz",
            employeeId: "11111111-1111-4111-8111-111111111111",
            employmentType: "Employee",
            firstName: "Aroha",
            jobTitle: "Dev",
            lastName: "Tane",
            rawPayload: {},
            startDate: "2026-01-01",
            status: "Active",
          },
        ],
        failures: [],
        rawItemCount: 1,
        rawResponse: {},
        seenEmployeeIds: ["11111111-1111-4111-8111-111111111111"],
      },
    });

    const result = await syncXeroPeople({
      bindingGeneration: 1,
      clerkOrgId: "org_1",
      organisationId: "00000000-0000-4000-8000-000000000001",
      triggerType: "manual",
      xeroTenantId: "00000000-0000-4000-8000-000000000003",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("succeeded");
      expect(result.value.fetched).toBe(1);
      expect(result.value.upserted).toBe(1);
      expect(result.value.failed).toBe(0);
    }
    expect(mocks.fetchEmployeesForRegion).toHaveBeenCalledWith(
      "NZ",
      expect.any(Object)
    );
    expect(mocks.personUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          first_name: "Aroha",
          is_active: true,
          last_name: "Tane",
        }),
        where: {
          clerk_org_id: "org_1",
          organisation_id_source_system_source_person_key: {
            organisation_id: "00000000-0000-4000-8000-000000000001",
            source_person_key: "11111111-1111-4111-8111-111111111111",
            source_system: "XERO",
          },
        },
      })
    );
  });

  it("syncs UK employees and handles case-insensitive ACTIVE status", async () => {
    mocks.xeroTenantFindFirst.mockResolvedValue(buildTenant("UK"));
    mocks.fetchEmployeesForRegion.mockResolvedValueOnce({
      ok: true,
      value: {
        complete: true,
        employees: [
          {
            email: "oliver@example.co.uk",
            employeeId: "22222222-2222-4222-8222-222222222222",
            employmentType: "Contractor",
            firstName: "Oliver",
            jobTitle: "Designer",
            lastName: "Smith",
            rawPayload: {},
            startDate: "2026-02-01",
            status: "ACTIVE",
          },
        ],
        failures: [],
        rawItemCount: 1,
        rawResponse: {},
        seenEmployeeIds: ["22222222-2222-4222-8222-222222222222"],
      },
    });

    const result = await syncXeroPeople({
      bindingGeneration: 1,
      clerkOrgId: "org_1",
      organisationId: "00000000-0000-4000-8000-000000000001",
      triggerType: "manual",
      xeroTenantId: "00000000-0000-4000-8000-000000000003",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("succeeded");
      expect(result.value.upserted).toBe(1);
    }
    expect(mocks.fetchEmployeesForRegion).toHaveBeenCalledWith(
      "UK",
      expect.any(Object)
    );
    expect(mocks.personUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          employment_type: "contractor",
          first_name: "Oliver",
          is_active: true,
          last_name: "Smith",
          person_type: "contractor",
        }),
      })
    );
  });

  it("does not fail a person when an adapter supplies an invalid optional start date", async () => {
    mocks.fetchEmployeesForRegion.mockResolvedValueOnce({
      ok: true,
      value: {
        complete: true,
        employees: [
          {
            email: "date@example.com",
            employeeId: "33333333-3333-4333-8333-333333333333",
            employmentType: "Employee",
            firstName: "Date",
            jobTitle: null,
            lastName: "Fallback",
            rawPayload: {},
            startDate: "not-a-date",
            status: "ACTIVE",
          },
        ],
        failures: [],
        rawItemCount: 1,
        rawResponse: {},
        seenEmployeeIds: ["33333333-3333-4333-8333-333333333333"],
      },
    });

    const result = await syncXeroPeople({
      bindingGeneration: 1,
      clerkOrgId: "org_1",
      organisationId: "00000000-0000-4000-8000-000000000001",
      triggerType: "manual",
      xeroTenantId: "00000000-0000-4000-8000-000000000003",
    });

    expect(result).toMatchObject({
      ok: true,
      value: { failed: 0, status: "succeeded", upserted: 1 },
    });
    expect(mocks.personUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ start_date: null }),
        update: expect.objectContaining({ start_date: null }),
      })
    );
  });

  it("handles regional fetch blanket error", async () => {
    mocks.xeroTenantFindFirst.mockResolvedValue(buildTenant("NZ"));
    mocks.fetchEmployeesForRegion.mockResolvedValueOnce({
      error: {
        code: "auth_error",
        message: "Xero credentials are missing or revoked.",
        recoveryReason: "reauthorise",
      },
      ok: false,
    });

    const result = await syncXeroPeople({
      bindingGeneration: 1,
      clerkOrgId: "org_1",
      organisationId: "00000000-0000-4000-8000-000000000001",
      triggerType: "manual",
      xeroTenantId: "00000000-0000-4000-8000-000000000003",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("failed");
    }
    expect(mocks.syncRunUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "failed",
        }),
      })
    );
  });

  it("cancels generation changed after fake fetch without persisting people", async () => {
    mocks.xeroTenantFindFirst
      .mockResolvedValueOnce(buildTenant())
      .mockResolvedValue(null);
    mocks.fetchEmployeesForRegion.mockResolvedValue({
      ok: true,
      value: {
        complete: true,
        employees: [],
        failures: [],
        rawItemCount: 0,
        seenEmployeeIds: [],
      },
    });
    const result = await syncXeroPeople({
      bindingGeneration: 1,
      clerkOrgId: "org_1",
      organisationId: "00000000-0000-4000-8000-000000000001",
      xeroTenantId: "00000000-0000-4000-8000-000000000003",
    });
    expect(result).toMatchObject({ ok: true, value: { status: "cancelled" } });
    expect(mocks.personUpsert).not.toHaveBeenCalled();
    expect(mocks.personUpdateMany).not.toHaveBeenCalled();
    expect(mocks.xeroTenantUpdateMany).not.toHaveBeenCalled();
    expect(mocks.syncRunUpdateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          error_summary: "generation_changed",
          status: "cancelled",
        }),
      })
    );
  });
});

// Campaign authority is verified in database runtime protocol tests; these tests isolate handler behaviour.
vi.mock("@repo/database/xero-campaign-access", () => ({
  assertXeroCampaignAccess: vi.fn(() => Promise.resolve()),
  assertXeroCampaignDispatch: vi.fn(() => Promise.resolve()),
  claimXeroCampaignScheduledDispatch: vi.fn(() => Promise.resolve(undefined)),
  currentXeroCampaignInvocation: vi.fn(() => undefined),
  lockXeroCampaignPersistence: vi.fn(() => Promise.resolve()),
  recordXeroCampaignDispatch: vi.fn(() => Promise.resolve()),
  withXeroCampaignInvocation: vi.fn(
    (_functionId: string, _input: unknown, operation: () => Promise<unknown>) =>
      operation()
  ),
  withXeroCampaignScopedEffect: (
    _scope: unknown,
    operation: () => Promise<unknown>
  ) => operation(),
  withXeroCampaignScopedInvocation: vi.fn(
    (_functionId: string, _input: unknown, operation: () => Promise<unknown>) =>
      operation()
  ),
  xeroCampaignAllowsOrdinaryMaintenance: vi.fn(() => Promise.resolve(true)),
}));
