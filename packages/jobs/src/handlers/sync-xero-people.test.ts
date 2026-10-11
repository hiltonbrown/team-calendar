import { systemDatabase as database } from "@repo/database";
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
  xeroConnectionFindFirst: vi.fn(),
  xeroConnectionUpdateMany: vi.fn(),
  xeroSyncCursorCreateMany: vi.fn(),
  xeroSyncCursorFindFirst: vi.fn(),
  xeroSyncCursorUpdateMany: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("../client", () => ({
  inngest: {
    createFunction: vi.fn(() => ({ id: "sync-xero-people" })),
    send: vi.fn(() => Promise.resolve({ ids: ["event_1"] })),
  },
}));
vi.mock("@repo/database", () => {
  const exports = {
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
      xeroConnection: {
        findFirst: mocks.xeroConnectionFindFirst,
        updateMany: mocks.xeroConnectionUpdateMany,
      },
      xeroSyncCursor: {
        createMany: mocks.xeroSyncCursorCreateMany,
        findFirst: mocks.xeroSyncCursorFindFirst,
        updateMany: mocks.xeroSyncCursorUpdateMany,
      },
    },
    scopedTo: mocks.scopedTo,
  };
  return {
    ...exports,
    getScopedXeroConnection: vi.fn(async (bindingScope) => ({
      ok: true,
      value: {
        authorisation: { status: "active" },
        id: bindingScope.connectionId,
      },
    })),
    systemDatabase: exports.database,
    tenantDatabase: vi.fn(() => exports.database),
    tenantTransaction: vi.fn((_clerkOrgId, callback) =>
      "$transaction" in exports.database
        ? exports.database.$transaction(callback)
        : callback(exports.database)
    ),
  };
});
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
    const tenant =
      await mocks.xeroConnectionFindFirst.mock.results.at(-1)?.value;
    return {
      ok: true,
      value: {
        ...result.value,
        accessToken: "fake-access",
        capability: scope.capability,
        connectionId: tenant.id,
        deadline: scope.deadline,
        payrollRegion: tenant.payroll_region,
        providerTenantId: tenant.xero_tenant_id ?? "fake-tenant",
      },
    };
  },
  toPlainLanguageMessage: mocks.toPlainLanguageMessage,
  toResolvedXeroConnection: (scope, value) => ({
    ...value,
    clerk_org_id: scope.clerkOrgId,
    id: value.connectionId,
    organisation_id: scope.organisationId,
    payroll_region: value.payrollRegion,
    xero_tenant_id: value.providerTenantId,
  }),
}));

import { syncXeroPeople } from "./sync-xero-people";

function buildConnection(region: "AU" | "NZ" | "UK" = "NZ") {
  return {
    clerk_org_id: "org_1",
    id: "00000000-0000-4000-8000-000000000003",
    organisation_id: "00000000-0000-4000-8000-000000000001",
    payroll_region: region,
    sync_paused_at: null,
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
    mocks.syncRunFindFirst.mockImplementation(
      async (args: { select?: { status?: boolean } }) =>
        args.select?.status
          ? { cancel_requested_at: null, status: "running" }
          : null
    );
    mocks.syncRunCreate.mockResolvedValue({ id: "run_1" });
    mocks.syncRunUpdateMany.mockResolvedValue({ count: 1 });
    mocks.xeroConnectionFindFirst.mockResolvedValue(buildConnection("NZ"));
    mocks.resolveXeroAccess.mockResolvedValue({
      ok: true,
      value: { refreshed: false },
    });
    mocks.personFindMany.mockResolvedValue([]);
    mocks.personUpdateMany.mockResolvedValue({ count: 0 });
    mocks.personUpsert.mockResolvedValue({ id: "person_1" });
    mocks.xeroConnectionUpdateMany.mockResolvedValue({ count: 1 });
    mocks.xeroSyncCursorFindFirst.mockResolvedValue(null);
    mocks.xeroSyncCursorCreateMany.mockResolvedValue({ count: 1 });
    mocks.xeroSyncCursorUpdateMany.mockResolvedValue({ count: 1 });
  });
  it("rejects invalid input schema with validation_error", async () => {
    const result = await syncXeroPeople({
      clerkOrgId: "",
      connectionId: "invalid-uuid",
      organisationId: "invalid-uuid",
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
    mocks.xeroConnectionFindFirst.mockResolvedValue(buildConnection("NZ"));
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
      clerkOrgId: "org_1",
      connectionId: "00000000-0000-4000-8000-000000000003",
      organisationId: "00000000-0000-4000-8000-000000000001",
      triggerType: "manual",
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
    mocks.xeroConnectionFindFirst.mockResolvedValue(buildConnection("UK"));
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
      clerkOrgId: "org_1",
      connectionId: "00000000-0000-4000-8000-000000000003",
      organisationId: "00000000-0000-4000-8000-000000000001",
      triggerType: "manual",
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
      clerkOrgId: "org_1",
      connectionId: "00000000-0000-4000-8000-000000000003",
      organisationId: "00000000-0000-4000-8000-000000000001",
      triggerType: "manual",
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
    mocks.xeroConnectionFindFirst.mockResolvedValue(buildConnection("NZ"));
    mocks.fetchEmployeesForRegion.mockResolvedValueOnce({
      error: {
        code: "auth_error",
        message: "Xero credentials are missing or revoked.",
        recoveryReason: "reauthorise",
      },
      ok: false,
    });
    const result = await syncXeroPeople({
      clerkOrgId: "org_1",
      connectionId: "00000000-0000-4000-8000-000000000003",
      organisationId: "00000000-0000-4000-8000-000000000001",
      triggerType: "manual",
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
  it("cancels connection disconnected after fake fetch without persisting people", async () => {
    mocks.xeroConnectionFindFirst
      .mockResolvedValueOnce(buildConnection())
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
      clerkOrgId: "org_1",
      connectionId: "00000000-0000-4000-8000-000000000003",
      organisationId: "00000000-0000-4000-8000-000000000001",
    });
    expect(result).toMatchObject({ ok: true, value: { status: "cancelled" } });
    expect(mocks.personUpsert).not.toHaveBeenCalled();
    expect(mocks.personUpdateMany).not.toHaveBeenCalled();
    expect(mocks.xeroConnectionUpdateMany).not.toHaveBeenCalled();
    expect(mocks.syncRunUpdateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          error_summary: "connection_changed",
          status: "cancelled",
        }),
      })
    );
  });
});
