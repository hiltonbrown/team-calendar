import { afterEach, describe, expect, it, vi } from "vitest";

const transport = vi.hoisted(() => ({ access: vi.fn(), fetch: vi.fn() }));
vi.mock("../../../packages/xero/keys.js", () => ({
  keys: () => ({ XERO_CLIENT_ID: "owned" }),
}));
vi.mock("../../../packages/xero/src/oauth/authorisation.js", () => ({
  resolveXeroAccess: transport.access,
}));
vi.mock("../../../packages/xero/src/rate-limit/xero-fetch.js", () => ({
  xeroFetch: transport.fetch,
}));

import {
  matchRawProviderLeave,
  observerSqlDate,
  rawProviderDate,
  readIndependentAuImport,
  readIndependentAuLeave,
} from "./xero-provider-oracle.js";

const raw = () => ({
  LeaveApplications: [
    {
      EmployeeID: "employee-owned",
      EndDate: "2026-10-02",
      LeaveApplicationID: "remote-owned",
      LeavePeriods: [{ LeavePeriodStatus: "REJECTED", NumberOfUnits: 8 }],
      LeaveTypeID: "leave-owned",
      StartDate: "2026-10-01",
      Status: "REJECTED",
    },
  ],
});
const expected = () => ({
  employeeId: "employee-owned",
  endsAt: "2026-10-02",
  leaveTypeId: "leave-owned",
  rawApplicationStatuses: ["REJECTED"],
  rawPeriodStatuses: ["REJECTED"],
  remoteId: "remote-owned",
  startsAt: "2026-10-01",
  units: 8,
});
afterEach(() => vi.unstubAllEnvs());
describe("independent raw AU provider oracle", () => {
  it("carries exact organisation access through every paginated and balance dispatch", async () => {
    vi.stubEnv("KV_REST_API_URL", "unit-only");
    vi.stubEnv("KV_REST_API_TOKEN", "unit-only");
    vi.stubEnv("XERO_APP_TIER", "starter");
    vi.stubEnv("XERO_API_BASE_URL", "");
    transport.access.mockResolvedValue({
      ok: true,
      value: {
        accessToken: "snapshot-token",
        connectionId: "connection-owned",
        deadline: { expiresAtMs: Date.now() + 90_000 },
        payrollRegion: "AU",
        xeroTenantId: "tenant-owned",
      },
    });
    const requests: string[] = [];
    transport.fetch.mockImplementation((input) => {
      expect(input.accessContext).toMatchObject({
        capability: ["payroll.employees.read", "payroll.settings.read"],
        clerk_org_id: "account-owned",
        id: "connection-owned",
        organisation_id: "organisation-owned",
        payroll_region: "AU",
        xero_tenant_id: "tenant-owned",
      });
      requests.push(input.url);
      return Response.json(
        input.url.includes("LeaveApplications")
          ? { LeaveApplications: [] }
          : {
              Employees: [{ EmployeeID: "employee-owned", LeaveBalances: [] }],
            }
      );
    });
    const result = await readIndependentAuImport({
      assertAuthority: vi.fn(),
      clerkOrgId: "account-owned",
      expectedTenantId: "tenant-owned",
      organisationId: "organisation-owned",
      ownedEmployeeIds: ["employee-owned"],
      providerAppId: "owned",
    });
    expect(result.complete).toBe(true);
    expect(requests).toHaveLength(3);
    expect(requests[2]).toContain("Employees/employee-owned");
  });
  it("keeps local withdrawal intent separate from explicitly approved rejected provider representation", () => {
    expect(matchRawProviderLeave(raw(), expected())).toHaveLength(1);
  });
  it("rejects exact wrong ID, employee, type, date, units and mapper-disagreeing raw state", () => {
    for (const override of [
      { remoteId: "foreign" },
      { employeeId: "foreign" },
      { leaveTypeId: "foreign" },
      { startsAt: "2026-10-03" },
      { units: 9 },
      { rawPeriodStatuses: ["APPROVED"] },
    ]) {
      expect(
        matchRawProviderLeave(raw(), { ...expected(), ...override })
      ).toHaveLength(0);
    }
  });
  it("does not hide duplicate candidates or malformed rows", () => {
    const payload = raw();
    const [row] = payload.LeaveApplications;
    payload.LeaveApplications.push(row);
    expect(matchRawProviderLeave(payload, expected())).toHaveLength(2);
    expect(() =>
      matchRawProviderLeave({ LeaveApplications: [{}] }, expected())
    ).toThrow();
  });
  it("independently reads raw provider JSON dates", () => {
    expect(rawProviderDate("/Date(0+0000)/")).toBe("1970-01-01");
    expect(() => rawProviderDate("invalid")).toThrow();
  });
  it("awaits rejected asynchronous authority before configuration or provider access", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    try {
      await expect(
        readIndependentAuLeave({
          assertAuthority: () => Promise.reject(new Error("authority revoked")),
          clerkOrgId: "org-owned",
          expectedTenantId: "owned",
          organisationId: "owned",
          providerAppId: "owned",
          remoteId: null,
        })
      ).rejects.toThrow("authority revoked");
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("LIVE never uses the NODE_ENV=test in-memory rate fallback when shared configuration is missing", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("KV_REST_API_URL", "");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      readIndependentAuLeave({
        assertAuthority: vi.fn(),
        clerkOrgId: "org-owned",
        expectedTenantId: "owned",
        organisationId: "owned",
        providerAppId: "owned",
        remoteId: null,
      })
    ).rejects.toThrow("actual shared quota");
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it.each(["UTC", "Australia/Brisbane", "America/Los_Angeles"])(
    "preserves SQL date text independently of process timezone %s",
    (timezone) => {
      const previous = process.env.TZ;
      process.env.TZ = timezone;
      try {
        expect(observerSqlDate("2026-10-01")).toBe("2026-10-01");
        expect(() => observerSqlDate(new Date(2026, 9, 1))).toThrow();
      } finally {
        process.env.TZ = previous;
      }
    }
  );
});
