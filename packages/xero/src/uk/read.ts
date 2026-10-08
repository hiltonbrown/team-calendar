import { log } from "@repo/observability/log";
import { z } from "zod";
import { keys } from "../../keys";
import { mapXeroTransportError } from "../adapter/classify-xero-failure";
import { xeroFetch } from "../rate-limit/xero-fetch";
import type {
  XeroEmployee,
  XeroEmployeeMapFailure,
  XeroEmployeesFetchResult,
} from "../read/employees";
import { tryMapXeroEmployees } from "../read/employees";
import {
  type FetchLeaveApplicationStatusInput,
  type FetchUkLeaveApplicationStatusInput,
  mapLeaveApplicationStatus,
  mapXeroReadHttpError,
  readXeroPayload,
  type XeroLeaveApplicationStatusResult,
} from "../read/leave-application-status";
import type { XeroLeaveBalance } from "../read/leave-balances";
import type {
  XeroLeaveRecord,
  XeroLeaveRecordStatus,
} from "../read/leave-records";
import type {
  XeroAccessContext,
  XeroWriteError,
  XeroWriteResult,
} from "../write/types";

const XERO_DEFAULT_BASE_URL = "https://api.xero.com";
const XERO_PAGE_SIZE = 100;
const XERO_MAX_PAGES = 200;
export async function fetchEmployees(input: {
  xeroConnection: XeroAccessContext;
}): Promise<XeroWriteResult<XeroEmployeesFetchResult>> {
  const tokenResult = resolveAccessToken(input.xeroConnection);
  if (!tokenResult.ok) {
    return tokenResult;
  }
  const decryptedAccessToken = tokenResult.token;
  try {
    const employees: XeroEmployee[] = [];
    const failures: XeroEmployeeMapFailure[] = [];
    const seenEmployeeIds: string[] = [];
    let rawItemCount = 0;
    let page = 1;
    let rawResponse: unknown = null;
    while (page <= XERO_MAX_PAGES) {
      const response = await xeroFetch({
        accessContext: input.xeroConnection,
        deadline: input.xeroConnection.deadline,
        init: {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${decryptedAccessToken}`,
            "Xero-Tenant-Id": input.xeroConnection.xero_tenant_id,
          },
          method: "GET",
        },
        rateClass: {
          kind: "tenant",
          providerAppId: keys().XERO_CLIENT_ID ?? "",
          xeroTenantId: input.xeroConnection.xero_tenant_id,
        },
        url: `${baseUrl()}/payroll.xro/2.0/employees?page=${page}`,
      });
      const rawPayload = await readXeroPayload(response);
      if (!response.ok) {
        return {
          error: mapXeroReadHttpError(response, rawPayload),
          ok: false,
        };
      }
      rawResponse ??= rawPayload;
      const mappedPage = tryMapXeroEmployees(rawPayload);
      if (!mappedPage.ok) {
        log.warn("Xero employee page could not be parsed", {
          clerkOrgId: input.xeroConnection.clerk_org_id,
          organisationId: input.xeroConnection.organisation_id,
          page,
        });
        return {
          ok: true,
          value: {
            complete: false,
            employees,
            failures,
            rawItemCount,
            rawResponse,
            seenEmployeeIds,
          },
        };
      }
      employees.push(...mappedPage.employees);
      failures.push(...mappedPage.failures);
      seenEmployeeIds.push(...mappedPage.seenEmployeeIds);
      rawItemCount += mappedPage.rawItemCount;
      if (mappedPage.rawItemCount < XERO_PAGE_SIZE) {
        return {
          ok: true,
          value: {
            complete: true,
            employees,
            failures,
            rawItemCount,
            rawResponse,
            seenEmployeeIds,
          },
        };
      }
      page += 1;
    }
    log.warn("Xero employee pagination exceeded the maximum page count", {
      clerkOrgId: input.xeroConnection.clerk_org_id,
      organisationId: input.xeroConnection.organisation_id,
      page: XERO_MAX_PAGES,
    });
    return {
      ok: true,
      value: {
        complete: false,
        employees,
        failures,
        rawItemCount,
        rawResponse,
        seenEmployeeIds,
      },
    };
  } catch (error) {
    return {
      error: mapXeroTransportError(error, false),
      ok: false,
    };
  }
}
const UkLeavePeriodSchema = z
  .object({
    NumberOfUnits: z.number().optional().nullable(),
    numberOfUnits: z.number().optional().nullable(),
    PeriodEndDate: z.string().optional().nullable(),
    PeriodStartDate: z.string().optional().nullable(),
    PeriodStatus: z.string().optional().nullable(),
    periodEndDate: z.string().optional().nullable(),
    periodStartDate: z.string().optional().nullable(),
    periodStatus: z.string().optional().nullable(),
  })
  .passthrough();
const UkLeaveItemSchema = z
  .object({
    Description: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    EmployeeID: z.string().optional().nullable(),
    EmployeeId: z.string().optional().nullable(),
    EndDate: z.string().optional().nullable(),
    employeeID: z.string().optional().nullable(),
    employeeId: z.string().optional().nullable(),
    endDate: z.string().optional().nullable(),
    LeaveID: z.string().optional().nullable(),
    LeaveId: z.string().optional().nullable(),
    LeaveTypeID: z.string().optional().nullable(),
    LeaveTypeId: z.string().optional().nullable(),
    leaveID: z.string().optional().nullable(),
    leaveId: z.string().optional().nullable(),
    leaveType: z.string().optional().nullable(),
    leaveTypeID: z.string().optional().nullable(),
    leaveTypeId: z.string().optional().nullable(),
    leaveTypeName: z.string().optional().nullable(),
    NumberOfUnits: z.number().optional().nullable(),
    numberOfUnits: z.number().optional().nullable(),
    Periods: z.array(UkLeavePeriodSchema).optional().nullable(),
    periods: z.array(UkLeavePeriodSchema).optional().nullable(),
    StartDate: z.string().optional().nullable(),
    Status: z.string().optional().nullable(),
    startDate: z.string().optional().nullable(),
    status: z.string().optional().nullable(),
    Title: z.string().optional().nullable(),
    TypeOfUnits: z.string().optional().nullable(),
    title: z.string().optional().nullable(),
    typeOfUnits: z.string().optional().nullable(),
    UpdatedDateUTC: z.string().optional().nullable(),
    UpdatedDateUtc: z.string().optional().nullable(),
    updatedDateUTC: z.string().optional().nullable(),
    updatedDateUtc: z.string().optional().nullable(),
  })
  .passthrough();
const UkLeaveEnvelopeSchema = z
  .object({
    Leave: z.array(UkLeaveItemSchema).optional(),
    leave: z.array(UkLeaveItemSchema).optional(),
  })
  .passthrough()
  .refine((data) => Array.isArray(data.leave) || Array.isArray(data.Leave), {
    message: "Envelope must contain leave or Leave array",
  });
export type MapUkLeaveRecordsResult =
  | {
      ok: true;
      records: XeroLeaveRecord[];
    }
  | {
      ok: false;
    };
export function mapUkLeaveRecords(
  payload: unknown,
  employeeId: string
): XeroLeaveRecord[] {
  const result = tryMapUkLeaveRecords(payload, employeeId);
  return result.ok ? result.records : [];
}
export function tryMapUkLeaveRecords(
  payload: unknown,
  employeeId: string
): MapUkLeaveRecordsResult {
  const parsedEnvelope = UkLeaveEnvelopeSchema.safeParse(payload);
  if (!parsedEnvelope.success) {
    return { ok: false };
  }
  const rawItems = parsedEnvelope.data.leave ?? parsedEnvelope.data.Leave ?? [];
  const records = rawItems.map((item) => mapUkLeaveItem(item, employeeId));
  return { ok: true, records };
}
function mapUkLeaveItem(
  item: z.infer<typeof UkLeaveItemSchema>,
  fallbackEmployeeId: string
): XeroLeaveRecord {
  const periods = item.periods ?? item.Periods ?? [];
  const units =
    periods.length > 0
      ? periods.reduce(
          (total, period) =>
            total + (period.numberOfUnits ?? period.NumberOfUnits ?? 0),
          0
        )
      : (item.numberOfUnits ?? item.NumberOfUnits ?? 0);
  const rawStatus =
    item.status ??
    item.Status ??
    periods[0]?.periodStatus ??
    periods[0]?.PeriodStatus ??
    null;
  return {
    employeeId:
      text(
        item.employeeID ?? item.employeeId ?? item.EmployeeID ?? item.EmployeeId
      ) || fallbackEmployeeId,
    endDate: text(item.endDate ?? item.EndDate),
    leaveApplicationId: text(
      item.leaveID ?? item.leaveId ?? item.LeaveID ?? item.LeaveId
    ),
    leaveTypeId: text(
      item.leaveTypeID ??
        item.leaveTypeId ??
        item.LeaveTypeID ??
        item.LeaveTypeId
    ),
    leaveTypeName: nullableText(
      item.leaveTypeName ??
        item.leaveType ??
        item.typeOfUnits ??
        item.TypeOfUnits
    ),
    rawPayload: item,
    startDate: text(item.startDate ?? item.StartDate),
    status: normaliseUkStatus(rawStatus),
    title: nullableText(
      item.title ?? item.Title ?? item.description ?? item.Description
    ),
    units,
    updatedDateUtc: nullableText(
      item.updatedDateUTC ??
        item.updatedDateUtc ??
        item.UpdatedDateUTC ??
        item.UpdatedDateUtc
    ),
  };
}
export async function fetchUkLeaveForEmployee(input: {
  xeroEmployeeId: string;
  xeroConnection: XeroAccessContext;
}): Promise<
  XeroWriteResult<{
    complete: boolean;
    leaveRecords: XeroLeaveRecord[];
    rawResponse: unknown;
  }>
> {
  const employeeId = text(input.xeroEmployeeId);
  if (!employeeId) {
    return {
      error: {
        code: "validation_error",
        message: "A valid xeroEmployeeId is required to fetch UK leave.",
      },
      ok: false,
    };
  }
  const tokenResult = resolveAccessToken(input.xeroConnection);
  if (!tokenResult.ok) {
    return tokenResult;
  }
  const decryptedAccessToken = tokenResult.token;
  try {
    const response = await xeroFetch({
      accessContext: input.xeroConnection,
      deadline: input.xeroConnection.deadline,
      init: {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${decryptedAccessToken}`,
          "Xero-Tenant-Id": input.xeroConnection.xero_tenant_id,
        },
        method: "GET",
      },
      rateClass: {
        kind: "tenant",
        providerAppId: keys().XERO_CLIENT_ID ?? "",
        xeroTenantId: input.xeroConnection.xero_tenant_id,
      },
      url: `${baseUrl()}/payroll.xro/2.0/employees/${encodeURIComponent(employeeId)}/leave`,
    });
    const rawPayload = await readXeroPayload(response);
    if (!response.ok) {
      return {
        error: mapXeroReadHttpError(response, rawPayload),
        ok: false,
      };
    }
    const mapped = tryMapUkLeaveRecords(rawPayload, employeeId);
    if (!mapped.ok) {
      log.warn("Xero UK employee leave payload could not be parsed", {
        clerkOrgId: input.xeroConnection.clerk_org_id,
        employeeId,
        organisationId: input.xeroConnection.organisation_id,
      });
      return {
        ok: true,
        value: {
          complete: false,
          leaveRecords: [],
          rawResponse: rawPayload,
        },
      };
    }
    return {
      ok: true,
      value: {
        complete: true,
        leaveRecords: mapped.records,
        rawResponse: rawPayload,
      },
    };
  } catch (error) {
    return {
      error: mapXeroTransportError(error, false),
      ok: false,
    };
  }
}
export const fetchLeaveForEmployee = fetchUkLeaveForEmployee;
const UkLeaveBalanceItemSchema = z
  .object({
    Balance: z.number().optional().nullable(),
    balance: z.number().optional().nullable(),
    CurrencyCode: z.string().optional().nullable(),
    currencyCode: z.string().optional().nullable(),
    LeaveBalanceID: z.string().optional().nullable(),
    LeaveBalanceId: z.string().optional().nullable(),
    LeaveName: z.string().optional().nullable(),
    LeaveTypeID: z.string().optional().nullable(),
    LeaveTypeId: z.string().optional().nullable(),
    leaveBalanceID: z.string().optional().nullable(),
    leaveBalanceId: z.string().optional().nullable(),
    leaveName: z.string().optional().nullable(),
    leaveTypeID: z.string().optional().nullable(),
    leaveTypeId: z.string().optional().nullable(),
    leaveTypeName: z.string().optional().nullable(),
    NumberOfUnits: z.number().optional().nullable(),
    numberOfUnits: z.number().optional().nullable(),
    TypeOfUnits: z.string().optional().nullable(),
    typeOfUnits: z.string().optional().nullable(),
  })
  .passthrough();
const UkLeaveBalancesEnvelopeSchema = z
  .object({
    LeaveBalances: z.array(UkLeaveBalanceItemSchema).optional(),
    leaveBalances: z.array(UkLeaveBalanceItemSchema).optional(),
  })
  .passthrough()
  .refine(
    (data) =>
      Array.isArray(data.leaveBalances) || Array.isArray(data.LeaveBalances),
    { message: "Envelope must contain leaveBalances or LeaveBalances array" }
  );
export type MapUkLeaveBalancesResult =
  | {
      ok: true;
      leaveBalances: XeroLeaveBalance[];
    }
  | {
      ok: false;
    };
export function mapUkLeaveBalances(
  payload: unknown,
  employeeId: string
): XeroLeaveBalance[] {
  const result = tryMapUkLeaveBalances(payload, employeeId);
  return result.ok ? result.leaveBalances : [];
}
export function tryMapUkLeaveBalances(
  payload: unknown,
  employeeId: string
): MapUkLeaveBalancesResult {
  const parsedEnvelope = UkLeaveBalancesEnvelopeSchema.safeParse(payload);
  if (!parsedEnvelope.success) {
    return { ok: false };
  }
  const rawItems =
    parsedEnvelope.data.leaveBalances ??
    parsedEnvelope.data.LeaveBalances ??
    [];
  const leaveBalances: XeroLeaveBalance[] = [];
  for (const item of rawItems) {
    const normalised = normaliseUkUnitTypeAndCurrency(
      item.typeOfUnits ?? item.TypeOfUnits,
      item.currencyCode ?? item.CurrencyCode
    );
    if (!normalised.ok) {
      // UK monetary or unsupported units fail closed without an explicit documented mapping.
      return { ok: false };
    }
    const balance =
      item.numberOfUnits ??
      item.NumberOfUnits ??
      item.balance ??
      item.Balance ??
      0;
    leaveBalances.push({
      balance,
      currencyCode: normalised.currencyCode,
      employeeId,
      leaveTypeId: text(
        item.leaveTypeID ??
          item.leaveTypeId ??
          item.LeaveTypeID ??
          item.LeaveTypeId
      ),
      leaveTypeName: nullableText(
        item.leaveTypeName ?? item.leaveName ?? item.LeaveName
      ),
      rawPayload: item,
      unitType: normalised.unitType,
    });
  }
  return { leaveBalances, ok: true };
}
function normaliseUkUnitTypeAndCurrency(
  typeOfUnitsRaw: string | null | undefined,
  currencyCodeRaw: string | null | undefined
): {
  currencyCode: string | null;
  ok: boolean;
  unitType: "currency" | "days" | "hours" | null;
} {
  const rawCurrency = nullableText(currencyCodeRaw);
  if (rawCurrency) {
    // UK does not currently have an approved documented monetary mapping.
    // Do not infer GBP or accept currency codes. Fail closed.
    return { currencyCode: null, ok: false, unitType: null };
  }
  const normalised = text(typeOfUnitsRaw).toLowerCase();
  if (!normalised) {
    return { currencyCode: null, ok: true, unitType: null };
  }
  if (normalised === "hour" || normalised === "hours") {
    return { currencyCode: null, ok: true, unitType: "hours" };
  }
  if (normalised === "day" || normalised === "days") {
    return { currencyCode: null, ok: true, unitType: "days" };
  }
  // Any monetary unit (e.g. "pound", "pounds", "gbp", "dollars", "currency") or unknown unit fails closed:
  return { currencyCode: null, ok: false, unitType: null };
}
export async function fetchUkLeaveBalancesForEmployee(input: {
  xeroEmployeeId: string;
  xeroConnection: XeroAccessContext;
}): Promise<
  XeroWriteResult<{
    leaveBalances: XeroLeaveBalance[];
    rawResponse: unknown;
  }>
> {
  const employeeId = text(input.xeroEmployeeId);
  if (!employeeId) {
    return {
      error: {
        code: "validation_error",
        message:
          "A valid xeroEmployeeId is required to fetch UK leave balances.",
      },
      ok: false,
    };
  }
  const tokenResult = resolveAccessToken(input.xeroConnection);
  if (!tokenResult.ok) {
    return tokenResult;
  }
  const decryptedAccessToken = tokenResult.token;
  try {
    const response = await xeroFetch({
      accessContext: input.xeroConnection,
      deadline: input.xeroConnection.deadline,
      init: {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${decryptedAccessToken}`,
          "Xero-Tenant-Id": input.xeroConnection.xero_tenant_id,
        },
        method: "GET",
      },
      rateClass: {
        kind: "tenant",
        providerAppId: keys().XERO_CLIENT_ID ?? "",
        xeroTenantId: input.xeroConnection.xero_tenant_id,
      },
      url: `${baseUrl()}/payroll.xro/2.0/employees/${encodeURIComponent(employeeId)}/leaveBalances`,
    });
    const rawPayload = await readXeroPayload(response);
    if (!response.ok) {
      return {
        error: mapXeroReadHttpError(response, rawPayload),
        ok: false,
      };
    }
    const mapped = tryMapUkLeaveBalances(rawPayload, employeeId);
    if (!mapped.ok) {
      log.warn("Xero UK employee leave balances payload could not be parsed", {
        clerkOrgId: input.xeroConnection.clerk_org_id,
        employeeId,
        organisationId: input.xeroConnection.organisation_id,
      });
      return {
        error: {
          code: "validation_error",
          message: "UK leave balances response could not be parsed.",
          rawPayload,
        },
        ok: false,
      };
    }
    return {
      ok: true,
      value: {
        leaveBalances: mapped.leaveBalances,
        rawResponse: rawPayload,
      },
    };
  } catch (error) {
    return {
      error: mapXeroTransportError(error, false),
      ok: false,
    };
  }
}
export const fetchLeaveBalancesForEmployee = fetchUkLeaveBalancesForEmployee;
export async function fetchUkLeaveApplicationStatus(
  input: FetchUkLeaveApplicationStatusInput
): Promise<XeroWriteResult<XeroLeaveApplicationStatusResult>> {
  const employeeId = text(input.xeroEmployeeId);
  const leaveApplicationId = text(input.xeroLeaveApplicationId);
  if (!(employeeId && leaveApplicationId)) {
    return {
      error: {
        code: "validation_error",
        message:
          "Both xeroEmployeeId and xeroLeaveApplicationId are required for UK status reads.",
      },
      ok: false,
    };
  }
  const tokenResult = resolveAccessToken(input.xeroConnection);
  if (!tokenResult.ok) {
    return tokenResult;
  }
  const decryptedAccessToken = tokenResult.token;
  try {
    const response = await xeroFetch({
      accessContext: input.xeroConnection,
      deadline: input.xeroConnection.deadline,
      init: {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${decryptedAccessToken}`,
          "Xero-Tenant-Id": input.xeroConnection.xero_tenant_id,
        },
        method: "GET",
      },
      rateClass: {
        kind: "tenant",
        providerAppId: keys().XERO_CLIENT_ID ?? "",
        xeroTenantId: input.xeroConnection.xero_tenant_id,
      },
      url: `${baseUrl()}/payroll.xro/2.0/employees/${encodeURIComponent(employeeId)}/leave/${encodeURIComponent(leaveApplicationId)}`,
    });
    const rawPayload = await readXeroPayload(response);
    if (!response.ok) {
      return {
        error: mapXeroReadHttpError(response, rawPayload),
        ok: false,
      };
    }
    return { ok: true, value: mapLeaveApplicationStatus(rawPayload) };
  } catch (error) {
    return {
      error: mapXeroTransportError(error, false),
      ok: false,
    };
  }
}
export async function fetchLeaveApplicationStatus(
  input: FetchLeaveApplicationStatusInput
): Promise<XeroWriteResult<XeroLeaveApplicationStatusResult>> {
  if (!input.xeroEmployeeId) {
    return {
      error: {
        code: "validation_error",
        message: "UK payroll approval-state read requires xeroEmployeeId.",
      },
      ok: false,
    };
  }
  return await fetchUkLeaveApplicationStatus(
    input as FetchUkLeaveApplicationStatusInput
  );
}
function baseUrl(): string {
  return keys().XERO_API_BASE_URL ?? XERO_DEFAULT_BASE_URL;
}
function resolveAccessToken(xeroConnection: XeroAccessContext):
  | {
      ok: true;
      token: string;
    }
  | {
      ok: false;
      error: XeroWriteError;
    } {
  if (!xeroConnection.accessToken) {
    return {
      error: {
        code: "unknown_error",
        dispatchPhase: "before_dispatch",
        message: "Xero access is unavailable.",
        recoveryReason: "operational_incident",
      },
      ok: false,
    };
  }
  return { ok: true, token: xeroConnection.accessToken };
}
function text(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}
function nullableText(value: string | null | undefined): string | null {
  const normalised = text(value);
  return normalised.length > 0 ? normalised : null;
}
function normaliseUkStatus(
  value: string | null | undefined
): XeroLeaveRecordStatus {
  const status = text(value).toUpperCase();
  if (
    status === "APPROVED" ||
    status === "SCHEDULED" ||
    status === "COMPLETED" ||
    status === "ESTIMATED"
  ) {
    return "APPROVED";
  }
  if (status === "REJECTED" || status === "DECLINED") {
    return "REJECTED";
  }
  if (status === "WITHDRAWN") {
    return "WITHDRAWN";
  }
  if (status === "DELETED") {
    return "DELETED";
  }
  if (status === "SUBMITTED" || status === "PENDING") {
    return "SUBMITTED";
  }
  return "UNKNOWN";
}
