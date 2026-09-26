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
  mapLeaveApplicationStatus,
  mapXeroReadHttpError,
  readXeroPayload,
  type XeroLeaveApplicationStatusResult,
} from "../read/leave-application-status";
import type {
  XeroLeaveBalance,
  XeroLeaveBalanceFetchFailure,
} from "../read/leave-balances";
import { mapXeroLeaveBalances } from "../read/leave-balances";
import type { XeroLeaveRecord } from "../read/leave-records";
import { tryMapXeroLeaveRecords } from "../read/leave-records";
import type {
  XeroTenantForWrite,
  XeroWriteError,
  XeroWriteResult,
} from "../write/types";

const XERO_DEFAULT_BASE_URL = "https://api.xero.com";
const XERO_PAGE_SIZE = 100;
const XERO_MAX_PAGES = 200;

const AuPayItemsSchema = z
  .object({
    PayItems: z
      .object({
        LeaveTypes: z
          .array(
            z
              .object({
                LeaveTypeID: z.string(),
                Name: z.string(),
              })
              .passthrough()
          )
          .optional(),
      })
      .passthrough(),
  })
  .passthrough();

// Xero permits 60 calls/min per connected organisation. Space the per-employee
// detail reads at least this far apart so a full balance sync stays within that
// ceiling instead of bursting into a 429 partway through.
const XERO_CALLS_PER_MINUTE = 60;
const LEAVE_BALANCE_READ_INTERVAL_MS = Math.ceil(
  60_000 / XERO_CALLS_PER_MINUTE
);

export type { XeroEmployeesFetchResult } from "../read/employees";
export type { XeroLeaveBalanceFetchFailure } from "../read/leave-balances";

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
        url: `${baseUrl()}/payroll.xro/1.0/Employees?page=${page}`,
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
        // The page envelope itself could not be read (e.g. Employees was not
        // an array). Record-level failures inside a well-formed envelope are
        // already isolated by tryMapXeroEmployees, so this is rarer and
        // treated like a truncated leave-record fetch: return what has been
        // gathered so far as incomplete rather than discarding it.
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

      // Pagination termination must use the raw page length Xero returned,
      // never the count of records that mapped cleanly, otherwise a page
      // full of malformed records would look like a short final page.
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

export async function fetchLeaveRecords(input: {
  xeroTenant: XeroTenantForWrite;
}): Promise<
  XeroWriteResult<{
    complete: boolean;
    leaveRecords: XeroLeaveRecord[];
    rawResponse: unknown;
  }>
> {
  const tokenResult = resolveAccessToken(input.xeroTenant);
  if (!tokenResult.ok) {
    return tokenResult;
  }
  const decryptedAccessToken = tokenResult.token;

  try {
    const leaveTypeNamesResult = await fetchAuLeaveTypeNames({
      accessToken: decryptedAccessToken,
      xeroTenant: input.xeroTenant,
    });
    if (!leaveTypeNamesResult.ok) {
      return leaveTypeNamesResult;
    }

    const leaveRecords: XeroLeaveRecord[] = [];
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
        url: `${baseUrl()}/payroll.xro/1.0/LeaveApplications/v2?page=${page}`,
      });
      const rawPayload = await readXeroPayload(response);

      if (!response.ok) {
        return {
          error: mapXeroReadHttpError(response, rawPayload),
          ok: false,
        };
      }

      rawResponse ??= rawPayload;
      const mappedPage = tryMapXeroLeaveRecords(
        rawPayload,
        leaveTypeNamesResult.value
      );
      if (!mappedPage.ok) {
        log.warn("Xero leave record page could not be parsed", {
          clerkOrgId: input.xeroTenant.clerk_org_id,
          organisationId: input.xeroTenant.organisation_id,
          page,
        });
        return {
          ok: true,
          value: { complete: false, leaveRecords, rawResponse },
        };
      }
      leaveRecords.push(...mappedPage.records);

      if (mappedPage.records.length < XERO_PAGE_SIZE) {
        return {
          ok: true,
          value: { complete: true, leaveRecords, rawResponse },
        };
      }

      page += 1;
    }

    log.warn("Xero leave record pagination exceeded the maximum page count", {
      clerkOrgId: input.xeroTenant.clerk_org_id,
      organisationId: input.xeroTenant.organisation_id,
      page: XERO_MAX_PAGES,
    });
    return {
      ok: true,
      value: { complete: false, leaveRecords, rawResponse },
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

async function fetchAuLeaveTypeNames(input: {
  accessToken: string;
  xeroTenant: XeroTenantForWrite;
}): Promise<XeroWriteResult<ReadonlyMap<string, string>>> {
  const response = await xeroFetch({
    init: {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${input.accessToken}`,
        "Xero-Tenant-Id": input.xeroTenant.xero_tenant_id,
      },
      method: "GET",
    },
    orgKey: orgRateLimitKey({
      clerkOrgId: input.xeroTenant.clerk_org_id,
      organisationId: input.xeroTenant.organisation_id,
    }),
    url: `${baseUrl()}/payroll.xro/1.0/PayItems`,
  });
  const rawPayload = await readXeroPayload(response);
  if (!response.ok) {
    return {
      error: mapXeroReadHttpError(response, rawPayload),
      ok: false,
    };
  }

  const parsed = AuPayItemsSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return {
      error: {
        code: "validation_error",
        message: "Xero returned invalid AU payroll leave types.",
        rawPayload,
      },
      ok: false,
    };
  }

  return {
    ok: true,
    value: new Map(
      (parsed.data.PayItems.LeaveTypes ?? []).map((leaveType) => [
        leaveType.LeaveTypeID,
        leaveType.Name,
      ])
    ),
  };
}

export async function fetchLeaveBalances(input: {
  employeeIds: string[];
  // Invoked after each employee is processed so a long-running caller can emit a
  // liveness heartbeat. The fetch reads one employee per second to stay under
  // the Xero rate limit, so large tenants can run for many minutes.
  onProgress?: (processed: number, total: number) => Promise<void> | void;
  // Override the per-request pacing. Defaults to the Xero rate-limit interval;
  // tests pass 0 to run without the real-time delay.
  readIntervalMs?: number;
  xeroTenant: XeroTenantForWrite;
}): Promise<
  XeroWriteResult<{
    failures: XeroLeaveBalanceFetchFailure[];
    leaveBalances: XeroLeaveBalance[];
    rawResponses: unknown[];
  }>
> {
  const tokenResult = resolveAccessToken(input.xeroTenant);
  if (!tokenResult.ok) {
    return tokenResult;
  }
  const decryptedAccessToken = tokenResult.token;

  const intervalMs = input.readIntervalMs ?? LEAVE_BALANCE_READ_INTERVAL_MS;
  const leaveBalances: XeroLeaveBalance[] = [];
  const rawResponses: unknown[] = [];
  const failures: XeroLeaveBalanceFetchFailure[] = [];

  for (const [index, employeeId] of input.employeeIds.entries()) {
    if (index > 0 && intervalMs > 0) {
      await sleep(intervalMs);
    }

    let response: Response;
    try {
      response = await xeroFetch({
        init: {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${decryptedAccessToken}`,
            "Xero-Tenant-Id": input.xeroTenant.xero_tenant_id,
          },
          method: "GET",
        },
        // The loop aborts the whole run on a rate-limit so the Inngest job can
        // retry later; no inline retry here.
        maxAttempts: 1,
        orgKey: orgRateLimitKey({
          clerkOrgId: input.xeroTenant.clerk_org_id,
          organisationId: input.xeroTenant.organisation_id,
        }),
        url: `${baseUrl()}/payroll.xro/1.0/Employees/${encodeURIComponent(employeeId)}`,
      });
    } catch (error) {
      // A transport failure is environmental rather than employee-specific, so
      // abort and let the run retry instead of flagging every employee.
      return {
        error: {
          code: "network_error",
          message:
            error instanceof Error ? error.message : "Failed to reach Xero.",
        },
        ok: false,
      };
    }

    const rawPayload = await readXeroPayload(response);
    rawResponses.push(rawPayload);

    if (!response.ok) {
      const mappedError = mapXeroReadHttpError(response, rawPayload);
      // Auth and rate-limit failures affect every subsequent call, so stop and
      // let the handler fail the run. Other errors (e.g. an employee removed
      // from Xero returning 404) are isolated so the rest still sync.
      if (
        mappedError.code === "auth_error" ||
        mappedError.code === "permission_error" ||
        mappedError.code === "rate_limit_error"
      ) {
        return { error: mappedError, ok: false };
      }
      failures.push({ employeeId, error: mappedError });
      await input.onProgress?.(index + 1, input.employeeIds.length);
      continue;
    }

    leaveBalances.push(...mapXeroLeaveBalances(rawPayload));
    await input.onProgress?.(index + 1, input.employeeIds.length);
  }

  return {
    ok: true,
    value: {
      failures,
      leaveBalances,
      rawResponses,
    },
  };
}

export async function fetchLeaveApplicationStatus(
  input: FetchLeaveApplicationStatusInput
): Promise<XeroWriteResult<XeroLeaveApplicationStatusResult>> {
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
      url: `${baseUrl()}/payroll.xro/1.0/LeaveApplications/${encodeURIComponent(
        input.xeroLeaveApplicationId
      )}`,
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

function baseUrl(): string {
  return keys().XERO_API_BASE_URL ?? XERO_DEFAULT_BASE_URL;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
