import { log } from "@repo/observability/log";
import { z } from "zod";
import { keys } from "../../keys";
import { tryDecryptXeroToken } from "../crypto/tokens";
import { orgRateLimitKey, xeroFetch } from "../rate-limit/xero-fetch";
import type {
  XeroEmployee,
  XeroEmployeeMapFailure,
  XeroEmployeesFetchResult,
} from "../read/employees";
import { tryMapXeroEmployees } from "../read/employees";
import {
  type FetchLeaveApplicationStatusInput,
  type FetchNzLeaveApplicationStatusInput,
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
  XeroTenantForWrite,
  XeroWriteError,
  XeroWriteResult,
} from "../write/types";

const XERO_DEFAULT_BASE_URL = "https://api.xero.com";
const XERO_PAGE_SIZE = 100;
const XERO_MAX_PAGES = 200;

export async function fetchEmployees(input: {
  xeroTenant: XeroTenantForWrite;
}): Promise<XeroWriteResult<XeroEmployeesFetchResult>> {
  const tokenResult = resolveAccessToken(input.xeroTenant);
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
        init: {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${decryptedAccessToken}`,
            "Xero-Tenant-Id": input.xeroTenant.xero_tenant_id,
          },
          method: "GET",
        },
        orgKey: orgRateLimitKey({
          clerkOrgId: input.xeroTenant.clerk_org_id,
          organisationId: input.xeroTenant.organisation_id,
        }),
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
          clerkOrgId: input.xeroTenant.clerk_org_id,
          organisationId: input.xeroTenant.organisation_id,
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
      clerkOrgId: input.xeroTenant.clerk_org_id,
      organisationId: input.xeroTenant.organisation_id,
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
      error: {
        code: "network_error",
        message:
          error instanceof Error ? error.message : "Failed to reach Xero.",
      },
      ok: false,
    };
  }
}

const NzLeavePeriodSchema = z
  .object({
    NumberOfUnits: z.number().optional().nullable(),
    numberOfUnits: z.number().optional().nullable(),
    PeriodStatus: z.string().optional().nullable(),
    periodEndDate: z.string().optional().nullable(),
    periodStartDate: z.string().optional().nullable(),
    periodStatus: z.string().optional().nullable(),
  })
  .passthrough();

const NzLeaveItemSchema = z
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
    numberOfUnits: z.number().optional().nullable(),
    Periods: z.array(NzLeavePeriodSchema).optional().nullable(),
    periods: z.array(NzLeavePeriodSchema).optional().nullable(),
    StartDate: z.string().optional().nullable(),
    Status: z.string().optional().nullable(),
    startDate: z.string().optional().nullable(),
    status: z.string().optional().nullable(),
    Title: z.string().optional().nullable(),
    title: z.string().optional().nullable(),
    typeOfUnits: z.string().optional().nullable(),
    UpdatedDateUTC: z.string().optional().nullable(),
    UpdatedDateUtc: z.string().optional().nullable(),
    updatedDateUTC: z.string().optional().nullable(),
    updatedDateUtc: z.string().optional().nullable(),
  })
  .passthrough();

const NzLeaveEnvelopeSchema = z
  .object({
    Leave: z.array(NzLeaveItemSchema).optional(),
    leave: z.array(NzLeaveItemSchema).optional(),
  })
  .passthrough()
  .refine((data) => Array.isArray(data.leave) || Array.isArray(data.Leave), {
    message: "Envelope must contain leave or Leave array",
  });

export type MapNzLeaveRecordsResult =
  | { ok: true; records: XeroLeaveRecord[] }
  | { ok: false };

export function mapNzLeaveRecords(
  payload: unknown,
  employeeId: string
): XeroLeaveRecord[] {
  const result = tryMapNzLeaveRecords(payload, employeeId);
  return result.ok ? result.records : [];
}

export function tryMapNzLeaveRecords(
  payload: unknown,
  employeeId: string
): MapNzLeaveRecordsResult {
  const parsedEnvelope = NzLeaveEnvelopeSchema.safeParse(payload);
  if (!parsedEnvelope.success) {
    return { ok: false };
  }

  const rawItems = parsedEnvelope.data.leave ?? parsedEnvelope.data.Leave ?? [];
  const records = rawItems.map((item) => mapNzLeaveItem(item, employeeId));

  return { ok: true, records };
}

function mapNzLeaveItem(
  item: z.infer<typeof NzLeaveItemSchema>,
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
      : (item.numberOfUnits ?? 0);

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
      item.leaveTypeName ?? item.leaveType ?? item.typeOfUnits
    ),
    rawPayload: item,
    startDate: text(item.startDate ?? item.StartDate),
    status: normaliseNzStatus(rawStatus),
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

export async function fetchNzLeaveForEmployee(input: {
  xeroEmployeeId: string;
  xeroTenant: XeroTenantForWrite;
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
        message: "A valid xeroEmployeeId is required to fetch NZ leave.",
      },
      ok: false,
    };
  }

  const tokenResult = resolveAccessToken(input.xeroTenant);
  if (!tokenResult.ok) {
    return tokenResult;
  }
  const decryptedAccessToken = tokenResult.token;

  try {
    const response = await xeroFetch({
      init: {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${decryptedAccessToken}`,
          "Xero-Tenant-Id": input.xeroTenant.xero_tenant_id,
        },
        method: "GET",
      },
      orgKey: orgRateLimitKey({
        clerkOrgId: input.xeroTenant.clerk_org_id,
        organisationId: input.xeroTenant.organisation_id,
      }),
      url: `${baseUrl()}/payroll.xro/2.0/employees/${encodeURIComponent(
        employeeId
      )}/leave`,
    });
    const rawPayload = await readXeroPayload(response);

    if (!response.ok) {
      return {
        error: mapXeroReadHttpError(response, rawPayload),
        ok: false,
      };
    }

    const mapped = tryMapNzLeaveRecords(rawPayload, employeeId);
    if (!mapped.ok) {
      log.warn("Xero NZ employee leave payload could not be parsed", {
        clerkOrgId: input.xeroTenant.clerk_org_id,
        employeeId,
        organisationId: input.xeroTenant.organisation_id,
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
      error: {
        code: "network_error",
        message:
          error instanceof Error ? error.message : "Failed to reach Xero.",
      },
      ok: false,
    };
  }
}

export const fetchLeaveForEmployee = fetchNzLeaveForEmployee;

const NzLeaveBalanceItemSchema = z
  .object({
    balance: z.number().optional().nullable(),
    CurrencyCode: z.string().optional().nullable(),
    currencyCode: z.string().optional().nullable(),
    LeaveName: z.string().optional().nullable(),
    LeaveTypeID: z.string().optional().nullable(),
    LeaveTypeId: z.string().optional().nullable(),
    leaveBalanceID: z.string().optional().nullable(),
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

const NzLeaveBalancesEnvelopeSchema = z
  .object({
    LeaveBalances: z.array(NzLeaveBalanceItemSchema).optional(),
    leaveBalances: z.array(NzLeaveBalanceItemSchema).optional(),
  })
  .passthrough()
  .refine(
    (data) =>
      Array.isArray(data.leaveBalances) || Array.isArray(data.LeaveBalances),
    { message: "Envelope must contain leaveBalances or LeaveBalances array" }
  );

export type MapNzLeaveBalancesResult =
  | { ok: true; leaveBalances: XeroLeaveBalance[] }
  | { ok: false };

export function mapNzLeaveBalances(
  payload: unknown,
  employeeId: string
): XeroLeaveBalance[] {
  const result = tryMapNzLeaveBalances(payload, employeeId);
  return result.ok ? result.leaveBalances : [];
}

export function tryMapNzLeaveBalances(
  payload: unknown,
  employeeId: string
): MapNzLeaveBalancesResult {
  const parsedEnvelope = NzLeaveBalancesEnvelopeSchema.safeParse(payload);
  if (!parsedEnvelope.success) {
    return { ok: false };
  }

  const rawItems =
    parsedEnvelope.data.leaveBalances ??
    parsedEnvelope.data.LeaveBalances ??
    [];
  const leaveBalances = rawItems.map((item) =>
    mapNzLeaveBalanceItem(item, employeeId)
  );

  return { leaveBalances, ok: true };
}

function mapNzLeaveBalanceItem(
  item: z.infer<typeof NzLeaveBalanceItemSchema>,
  employeeId: string
): XeroLeaveBalance {
  const { currencyCode, unitType } = normaliseNzUnitTypeAndCurrency(
    item.typeOfUnits ?? item.TypeOfUnits
  );
  const balance = item.numberOfUnits ?? item.NumberOfUnits ?? item.balance ?? 0;

  return {
    balance,
    currencyCode,
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
    unitType,
  };
}

function normaliseNzUnitTypeAndCurrency(
  typeOfUnitsRaw: string | null | undefined
): {
  currencyCode: string | null;
  unitType: "currency" | "days" | "hours" | null;
} {
  const normalised = text(typeOfUnitsRaw).toLowerCase();
  if (
    normalised === "dollar" ||
    normalised === "dollars" ||
    normalised === "currency"
  ) {
    return { currencyCode: "NZD", unitType: "currency" };
  }
  if (normalised === "hour" || normalised === "hours") {
    return { currencyCode: null, unitType: "hours" };
  }
  if (normalised === "day" || normalised === "days") {
    return { currencyCode: null, unitType: "days" };
  }
  return { currencyCode: null, unitType: null };
}

export async function fetchNzLeaveBalancesForEmployee(input: {
  xeroEmployeeId: string;
  xeroTenant: XeroTenantForWrite;
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
          "A valid xeroEmployeeId is required to fetch NZ leave balances.",
      },
      ok: false,
    };
  }

  const tokenResult = resolveAccessToken(input.xeroTenant);
  if (!tokenResult.ok) {
    return tokenResult;
  }
  const decryptedAccessToken = tokenResult.token;

  try {
    const response = await xeroFetch({
      init: {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${decryptedAccessToken}`,
          "Xero-Tenant-Id": input.xeroTenant.xero_tenant_id,
        },
        method: "GET",
      },
      orgKey: orgRateLimitKey({
        clerkOrgId: input.xeroTenant.clerk_org_id,
        organisationId: input.xeroTenant.organisation_id,
      }),
      url: `${baseUrl()}/payroll.xro/2.0/employees/${encodeURIComponent(
        employeeId
      )}/leaveBalances`,
    });
    const rawPayload = await readXeroPayload(response);

    if (!response.ok) {
      return {
        error: mapXeroReadHttpError(response, rawPayload),
        ok: false,
      };
    }

    const mapped = tryMapNzLeaveBalances(rawPayload, employeeId);
    if (!mapped.ok) {
      log.warn("Xero NZ employee leave balances payload could not be parsed", {
        clerkOrgId: input.xeroTenant.clerk_org_id,
        employeeId,
        organisationId: input.xeroTenant.organisation_id,
      });
      return {
        error: {
          code: "validation_error",
          message: "NZ leave balances response could not be parsed.",
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
      error: {
        code: "network_error",
        message:
          error instanceof Error ? error.message : "Failed to reach Xero.",
      },
      ok: false,
    };
  }
}

export const fetchLeaveBalancesForEmployee = fetchNzLeaveBalancesForEmployee;

export async function fetchNzLeaveApplicationStatus(
  input: FetchNzLeaveApplicationStatusInput
): Promise<XeroWriteResult<XeroLeaveApplicationStatusResult>> {
  const employeeId = text(input.xeroEmployeeId);
  const leaveApplicationId = text(input.xeroLeaveApplicationId);

  if (!(employeeId && leaveApplicationId)) {
    return {
      error: {
        code: "validation_error",
        message:
          "Both xeroEmployeeId and xeroLeaveApplicationId are required for NZ status reads.",
      },
      ok: false,
    };
  }

  const tokenResult = resolveAccessToken(input.xeroTenant);
  if (!tokenResult.ok) {
    return tokenResult;
  }
  const decryptedAccessToken = tokenResult.token;

  try {
    const response = await xeroFetch({
      init: {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${decryptedAccessToken}`,
          "Xero-Tenant-Id": input.xeroTenant.xero_tenant_id,
        },
        method: "GET",
      },
      orgKey: orgRateLimitKey({
        clerkOrgId: input.xeroTenant.clerk_org_id,
        organisationId: input.xeroTenant.organisation_id,
      }),
      url: `${baseUrl()}/payroll.xro/2.0/employees/${encodeURIComponent(
        employeeId
      )}/leave/${encodeURIComponent(leaveApplicationId)}`,
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
      error: {
        code: "network_error",
        message:
          error instanceof Error ? error.message : "Failed to reach Xero.",
      },
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
        message: "NZ payroll approval-state read requires xeroEmployeeId.",
      },
      ok: false,
    };
  }
  return await fetchNzLeaveApplicationStatus(
    input as FetchNzLeaveApplicationStatusInput
  );
}

function baseUrl(): string {
  return keys().XERO_API_BASE_URL ?? XERO_DEFAULT_BASE_URL;
}

function resolveAccessToken(
  xeroTenant: XeroTenantForWrite
): { ok: true; token: string } | { ok: false; error: XeroWriteError } {
  const accessToken = xeroTenant.xero_connection.access_token_encrypted;
  const decrypted = tryDecryptXeroToken({
    authTag: xeroTenant.xero_connection.access_token_auth_tag ?? null,
    encrypted: accessToken,
    iv: xeroTenant.xero_connection.access_token_iv ?? null,
    keyVersion: xeroTenant.xero_connection.token_key_version,
  });

  if (!decrypted.ok) {
    log.warn("Xero token decryption failed", {
      clerkOrgId: xeroTenant.clerk_org_id,
      organisationId: xeroTenant.organisation_id,
      reason: decrypted.reason,
    });
  }

  const decryptedAccessToken = decrypted.ok ? decrypted.token : "";

  if (!decryptedAccessToken || xeroTenant.xero_connection.revoked_at) {
    return {
      error: {
        code: "auth_error",
        message: "Xero credentials are missing or revoked.",
      },
      ok: false,
    };
  }

  return { ok: true, token: decryptedAccessToken };
}

function text(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value: string | null | undefined): string | null {
  const normalised = text(value);
  return normalised.length > 0 ? normalised : null;
}

function normaliseNzStatus(
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
