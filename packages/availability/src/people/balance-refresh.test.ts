import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auditCreate: vi.fn(),
  dispatchSyncEvent: vi.fn(),
  getXeroConnectionStateForScope: vi.fn(),
  logError: vi.fn(),
  personFindFirst: vi.fn(),
  xeroTenantFindFirst: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/observability/log", () => ({
  log: { error: mocks.logError, info: vi.fn(), warn: vi.fn() },
}));
vi.mock("@repo/database", () => ({
  database: {
    auditEvent: { create: mocks.auditCreate },
    person: { findFirst: mocks.personFindFirst },
    xeroTenant: { findFirst: mocks.xeroTenantFindFirst },
  },
  scopedQuery: (clerkOrgId: string, organisationId: string) => ({
    clerk_org_id: clerkOrgId,
    organisation_id: organisationId,
  }),
}));
vi.mock("../xero-connection-state", () => ({
  getXeroConnectionStateForScope: mocks.getXeroConnectionStateForScope,
}));
vi.mock("../sync/sync-events", () => ({
  dispatchSyncEvent: mocks.dispatchSyncEvent,
}));

const { dispatchBalanceRefresh, setBalanceRefreshDispatcher } = await import(
  "./balance-refresh"
);

const input = {
  actingRole: "admin" as const,
  actingUserId: "admin_1",
  clerkOrgId: "org_1",
  organisationId: "00000000-0000-4000-8000-000000000001",
  personId: "00000000-0000-4000-8000-000000000011",
};

function mockLinkedPerson() {
  mocks.personFindFirst.mockResolvedValueOnce({
    id: input.personId,
    xero_employee_id: "employee-1",
  });
}

describe("dispatchBalanceRefresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setBalanceRefreshDispatcher(null);
    mocks.auditCreate.mockResolvedValue({});
    mocks.getXeroConnectionStateForScope.mockResolvedValue({
      ok: true,
      value: { bindingGeneration: 1, state: "connected" },
    });
    mocks.xeroTenantFindFirst.mockResolvedValue({ id: "xero-tenant-1" });
  });

  it.each(["manager", "viewer"] as const)(
    "rejects %s users before any tenant lookup",
    async (actingRole) => {
      const result = await dispatchBalanceRefresh({ ...input, actingRole });

      expect(result).toEqual({
        error: {
          code: "not_authorised",
          message: "You do not have permission to refresh balances.",
        },
        ok: false,
      });
      expect(mocks.personFindFirst).not.toHaveBeenCalled();
      expect(mocks.auditCreate).not.toHaveBeenCalled();
    }
  );

  it("returns person_not_found and logs when person belongs to another org", async () => {
    mocks.personFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      clerk_org_id: "org_2",
      organisation_id: "00000000-0000-4000-8000-000000000002",
    });

    const result = await dispatchBalanceRefresh(input);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("person_not_found");
    }
    expect(mocks.logError).toHaveBeenCalledWith(
      "Cross-tenant resource access attempt",
      {
        actingClerkOrgId: input.clerkOrgId,
        actingOrganisationId: input.organisationId,
        resourceId: input.personId,
        resourceType: "person",
      }
    );
  });

  it("returns identical error for cross-org person and non-existent person", async () => {
    mocks.personFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      clerk_org_id: "org_2",
      organisation_id: "00000000-0000-4000-8000-000000000002",
    });
    const crossOrgResult = await dispatchBalanceRefresh(input);

    mocks.personFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    const nonExistentResult = await dispatchBalanceRefresh(input);

    expect(crossOrgResult).toEqual(nonExistentResult);
  });

  it("returns person_not_found when the person does not exist anywhere", async () => {
    mocks.personFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const result = await dispatchBalanceRefresh(input);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("person_not_found");
    }
  });

  it("records not_xero_linked when the person is not linked to Xero", async () => {
    mocks.personFindFirst.mockResolvedValueOnce({
      id: input.personId,
      xero_employee_id: null,
    });

    const result = await dispatchBalanceRefresh(input);

    expect(result).toEqual({
      ok: true,
      value: { queued: false, reason: "not_xero_linked" },
    });
    expect(mocks.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payload: expect.objectContaining({
            queued: false,
            reason: "not_xero_linked",
          }),
        }),
      })
    );
  });

  it("records xero_not_connected when the organisation has no active Xero connection", async () => {
    mockLinkedPerson();
    mocks.getXeroConnectionStateForScope.mockResolvedValueOnce({
      ok: true,
      value: { bindingGeneration: null, state: "not_connected" },
    });

    const result = await dispatchBalanceRefresh(input);

    expect(result).toEqual({
      ok: true,
      value: { queued: false, reason: "xero_not_connected" },
    });
    expect(mocks.xeroTenantFindFirst).not.toHaveBeenCalled();
  });

  it("records xero_not_connected when no usable Xero tenant exists", async () => {
    mockLinkedPerson();
    mocks.xeroTenantFindFirst.mockResolvedValueOnce(null);

    const result = await dispatchBalanceRefresh(input);

    expect(result).toEqual({
      ok: true,
      value: { queued: false, reason: "xero_not_connected" },
    });
  });

  it("records job_not_registered when no dispatcher is installed", async () => {
    mockLinkedPerson();

    const result = await dispatchBalanceRefresh(input);

    expect(result).toEqual({
      ok: true,
      value: { queued: false, reason: "job_not_registered" },
    });
  });

  it("records dispatch_failed when the dispatcher rejects the job", async () => {
    const dispatcher = vi.fn().mockResolvedValue({
      error: { message: "Queue unavailable" },
      ok: false,
    });
    mockLinkedPerson();
    setBalanceRefreshDispatcher(dispatcher);

    const result = await dispatchBalanceRefresh(input);

    expect(result).toEqual({
      ok: true,
      value: { queued: false, reason: "dispatch_failed" },
    });
    expect(dispatcher).toHaveBeenCalledWith({
      bindingGeneration: 1,
      clerkOrgId: input.clerkOrgId,
      dispatchedBy: input.actingUserId,
      organisationId: input.organisationId,
      personId: input.personId,
      xeroTenantId: "xero-tenant-1",
    });
  });

  it.each(["admin", "owner"] as const)(
    "queues a balance refresh for %s users",
    async (actingRole) => {
      const dispatcher = vi
        .fn()
        .mockResolvedValue({ ok: true, value: undefined });
      mockLinkedPerson();
      setBalanceRefreshDispatcher(dispatcher);

      const result = await dispatchBalanceRefresh({ ...input, actingRole });

      expect(result).toEqual({ ok: true, value: { queued: true } });
      expect(dispatcher).toHaveBeenCalledWith({
        bindingGeneration: 1,
        clerkOrgId: input.clerkOrgId,
        dispatchedBy: input.actingUserId,
        organisationId: input.organisationId,
        personId: input.personId,
        xeroTenantId: "xero-tenant-1",
      });
      expect(mocks.auditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            payload: expect.objectContaining({
              queued: true,
              reason: null,
            }),
          }),
        })
      );
    }
  );
});
