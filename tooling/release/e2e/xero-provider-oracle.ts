import { z } from "zod";
import { toResolvedXeroConnection } from "../../../packages/xero/src/adapter/resolved-tenant.js";

const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
const jsonDate = /^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/;
export function rawProviderDate(value: string) {
  if (dateOnly.test(value)) {
    return value;
  }
  // biome-ignore lint/suspicious/noUnnecessaryConditions: RegExp.exec returns null for malformed external dates at runtime.
  const match = jsonDate.exec(value) ?? [];
  if (!match[1]) {
    throw new Error("Provider date is unrecognised");
  }
  const date = new Date(Number(match[1]));
  if (!Number.isFinite(date.getTime())) {
    throw new Error("Provider date is invalid");
  }
  return date.toISOString().slice(0, 10);
}
const rawLeaveSchema = z.object({
  EmployeeID: z.string().min(1),
  EndDate: z.string().min(1),
  LeaveApplicationID: z.string().min(1),
  LeavePeriods: z
    .array(
      z.object({
        LeavePeriodStatus: z.string().min(1),
        NumberOfUnits: z.number().nonnegative(),
      })
    )
    .min(1),
  LeaveTypeID: z.string().min(1),
  StartDate: z.string().min(1),
  Status: z.string().min(1).optional(),
});
export type RawProviderLeave = z.infer<typeof rawLeaveSchema>;
export interface IndependentLeaveExpectation {
  employeeId: string;
  endsAt: string;
  leaveTypeId: string;
  rawApplicationStatuses: readonly string[];
  rawPeriodStatuses: readonly string[];
  remoteId: string | null;
  startsAt: string;
  units: number;
}
export function matchRawProviderLeave(
  value: unknown,
  expectation: IndependentLeaveExpectation
) {
  const payload = z
    .object({ LeaveApplications: z.array(rawLeaveSchema) })
    .parse(value);
  return payload.LeaveApplications.filter(
    (row) =>
      (expectation.remoteId === null ||
        row.LeaveApplicationID === expectation.remoteId) &&
      row.EmployeeID === expectation.employeeId &&
      row.LeaveTypeID === expectation.leaveTypeId &&
      rawProviderDate(row.StartDate) === expectation.startsAt &&
      rawProviderDate(row.EndDate) === expectation.endsAt &&
      Math.abs(
        row.LeavePeriods.reduce(
          (total, period) => total + period.NumberOfUnits,
          0
        ) - expectation.units
      ) < 0.000_001 &&
      (row.Status === undefined
        ? expectation.rawApplicationStatuses.length === 0
        : expectation.rawApplicationStatuses.includes(row.Status)) &&
      row.LeavePeriods.every((period) =>
        expectation.rawPeriodStatuses.includes(period.LeavePeriodStatus)
      )
  );
}
export async function readIndependentAuLeave(input: {
  clerkOrgId: string;
  organisationId: string;
  expectedTenantId: string;
  providerAppId: string;
  remoteId: string | null;
  assertAuthority: () => void | Promise<void>;
}) {
  await input.assertAuthority();
  if (
    !(
      process.env.KV_REST_API_URL &&
      process.env.KV_REST_API_TOKEN &&
      process.env.XERO_APP_TIER
    )
  ) {
    throw new Error("LIVE oracle requires actual shared quota configuration");
  }
  const { keys } = await import("../../../packages/xero/keys.js");
  if (keys().XERO_CLIENT_ID !== input.providerAppId) {
    throw new Error("LIVE oracle provider app identity is mismatched");
  }
  if (process.env.XERO_API_BASE_URL) {
    throw new Error("LIVE oracle rejects provider overrides and interception");
  }
  const [{ resolveXeroAccess }, { createXeroDeadline }, { xeroFetch }] =
    await Promise.all([
      import("../../../packages/xero/src/oauth/authorisation.js"),
      import("../../../packages/xero/src/rate-limit/deadline.js"),
      import("../../../packages/xero/src/rate-limit/xero-fetch.js"),
    ]);
  const deadline = createXeroDeadline(90_000);
  await input.assertAuthority();
  const access = await resolveXeroAccess({
    capability: ["payroll.employees.read", "payroll.settings.read"],
    clerkOrgId: input.clerkOrgId,
    deadline,
    organisationId: input.organisationId,
  });
  if (
    !access.ok ||
    access.value.payrollRegion !== "AU" ||
    access.value.xeroTenantId !== input.expectedTenantId
  ) {
    throw new Error("Independent provider access is unavailable or mismatched");
  }
  const rows: RawProviderLeave[] = [];
  let complete = false;
  let page = 1;
  while (page <= 200 && !complete) {
    const url = input.remoteId
      ? `https://api.xero.com/payroll.xro/1.0/LeaveApplications/${encodeURIComponent(input.remoteId)}`
      : `https://api.xero.com/payroll.xro/1.0/LeaveApplications/v2?page=${page}`;
    await input.assertAuthority();
    const response = await xeroFetch({
      accessContext: toResolvedXeroConnection(
        {
          capability: ["payroll.employees.read", "payroll.settings.read"],
          clerkOrgId: input.clerkOrgId,
          organisationId: input.organisationId,
        },
        access.value
      ),
      deadline,
      init: {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${access.value.accessToken}`,
          "Xero-Tenant-Id": access.value.xeroTenantId,
        },
        method: "GET",
      },
      maxAttempts: 1,
      rateClass: {
        kind: "tenant",
        providerAppId: input.providerAppId,
        xeroTenantId: access.value.xeroTenantId,
      },
      url,
    });
    if (!response.ok) {
      throw new Error("Independent provider read failed");
    }
    const payload = z
      .object({ LeaveApplications: z.array(rawLeaveSchema).max(100) })
      .parse(await response.json());
    rows.push(...payload.LeaveApplications);
    complete =
      input.remoteId !== null || payload.LeaveApplications.length < 100;
    page += 1;
  }
  if (
    !complete ||
    new Set(rows.map((row) => row.LeaveApplicationID)).size !== rows.length
  ) {
    throw new Error(
      "Independent provider enumeration is incomplete or duplicated"
    );
  }
  await input.assertAuthority();
  return {
    complete,
    intercepted: false as const,
    observedAt: new Date().toISOString(),
    origin: "https://api.xero.com" as const,
    pages: page - 1,
    payload: { LeaveApplications: rows },
  };
}

export async function readIndependentAuImport(input: {
  clerkOrgId: string;
  organisationId: string;
  expectedTenantId: string;
  providerAppId: string;
  ownedEmployeeIds: readonly string[];
  assertAuthority: () => void | Promise<void>;
}) {
  // Reuses exactly the guarded LIVE transport and access contract of the leave
  // oracle. Production response mappers are deliberately never imported.
  const leave = await readIndependentAuLeave({ ...input, remoteId: null });
  const [{ resolveXeroAccess }, { createXeroDeadline }, { xeroFetch }] =
    await Promise.all([
      import("../../../packages/xero/src/oauth/authorisation.js"),
      import("../../../packages/xero/src/rate-limit/deadline.js"),
      import("../../../packages/xero/src/rate-limit/xero-fetch.js"),
    ]);
  const deadline = createXeroDeadline(90_000);
  await input.assertAuthority();
  const access = await resolveXeroAccess({
    capability: ["payroll.employees.read", "payroll.settings.read"],
    clerkOrgId: input.clerkOrgId,
    deadline,
    organisationId: input.organisationId,
  });
  if (
    !access.ok ||
    access.value.payrollRegion !== "AU" ||
    access.value.xeroTenantId !== input.expectedTenantId
  ) {
    throw new Error("Independent import access is unavailable");
  }
  const request = async (path: string) => {
    await input.assertAuthority();
    const response = await xeroFetch({
      accessContext: toResolvedXeroConnection(
        {
          capability: ["payroll.employees.read", "payroll.settings.read"],
          clerkOrgId: input.clerkOrgId,
          organisationId: input.organisationId,
        },
        access.value
      ),
      deadline,
      init: {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${access.value.accessToken}`,
          "Xero-Tenant-Id": access.value.xeroTenantId,
        },
        method: "GET",
      },
      maxAttempts: 1,
      rateClass: {
        kind: "tenant",
        providerAppId: input.providerAppId,
        xeroTenantId: access.value.xeroTenantId,
      },
      url: `https://api.xero.com/payroll.xro/1.0/${path}`,
    });
    if (!response.ok) {
      throw new Error("Independent import provider read failed");
    }
    return z
      .object({
        Employees: z.array(
          z.object({
            EmployeeID: z.string().min(1),
            LeaveBalances: z
              .array(
                z.object({
                  LeaveTypeID: z.string().min(1),
                  NumberOfUnits: z.number(),
                  TypeOfUnits: z.string().min(1),
                })
              )
              .optional(),
          })
        ),
      })
      .parse(await response.json());
  };
  const employees: { EmployeeID: string }[] = [];
  let complete = false;
  let employeePages = 0;
  for (let page = 1; page <= 200 && !complete; page += 1) {
    const payload = await request(`Employees?page=${page}`);
    if (payload.Employees.length > 100) {
      throw new Error("Provider employee page exceeds verified bounds");
    }
    employees.push(...payload.Employees);
    employeePages += 1;
    complete = payload.Employees.length < 100;
  }
  if (
    !complete ||
    new Set(employees.map((row) => row.EmployeeID)).size !== employees.length ||
    employees.some((row) => !input.ownedEmployeeIds.includes(row.EmployeeID))
  ) {
    throw new Error(
      "Independent payroll enumeration is incomplete or outside sanctioned employee ownership"
    );
  }
  const balances: {
    EmployeeID: string;
    LeaveBalances?: {
      LeaveTypeID: string;
      NumberOfUnits: number;
      TypeOfUnits: string;
    }[];
  }[] = [];
  for (const employee of employees) {
    const payload = await request(
      `Employees/${encodeURIComponent(employee.EmployeeID)}`
    );
    if (
      payload.Employees.length !== 1 ||
      payload.Employees[0]?.EmployeeID !== employee.EmployeeID
    ) {
      throw new Error("Independent balance employee is mismatched");
    }
    balances.push(...payload.Employees);
  }
  await input.assertAuthority();
  return {
    balances,
    complete: true as const,
    employeePages,
    employees,
    intercepted: false as const,
    leavePages: leave.pages,
    leaves: leave.payload.LeaveApplications,
    observedAt: new Date().toISOString(),
    origin: "https://api.xero.com" as const,
  };
}

export function observerSqlDate(value: unknown) {
  return z.iso.date().parse(value);
}
