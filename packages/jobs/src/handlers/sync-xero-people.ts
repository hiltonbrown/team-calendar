import "server-only";

import type { Result } from "@repo/core";
import { database, scopedTo as scoped } from "@repo/database";
import { Prisma } from "@repo/database/generated/client";
import { publishOrganisationNotificationEvent } from "@repo/notifications";
import { log } from "@repo/observability/log";
import { noemailFallbackDomain } from "@repo/seo/branding";
import {
  ensureFreshXeroConnection,
  fetchEmployeesForRegion,
  toPlainLanguageMessage,
  type XeroEmployee,
  type XeroEmployeeMapFailure,
  type XeroWriteError,
} from "@repo/xero";
import type { InngestFunction } from "inngest";
import { z } from "zod";
import { captureInitialSyncCompleted } from "../activation";
import { inngest } from "../client";

const SyncXeroPeopleInputSchema = z.object({
  clerkOrgId: z.string().min(1),
  organisationId: z.string().uuid(),
  triggeredByUserId: z.string().min(1).nullable().optional(),
  triggerType: z.enum(["scheduled", "manual", "webhook"]).default("manual"),
  xeroTenantId: z.string().uuid(),
});

export type SyncXeroPeopleInput = z.infer<typeof SyncXeroPeopleInputSchema>;

export type SyncXeroPeopleError =
  | { code: "validation_error"; message: string }
  | { code: "unknown_error"; message: string };

type JsonValue =
  | boolean
  | null
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

const BATCH_SIZE = 50;
const STALE_RUN_WINDOW_MS = 30 * 60 * 1000;
const UUID_REGEX = /^[0-9a-fA-F-]{36}$/;

export const syncXeroPeopleFunction: InngestFunction.Any =
  inngest.createFunction(
    {
      cancelOn: [
        {
          event: "cancel-sync-run",
          if: "async.data.runId == event.data.runId",
        },
      ],
      id: "sync-xero-people",
      triggers: { event: "sync-xero-people" },
    },
    async ({ event, step }) =>
      await step.run("sync-people", async () => syncXeroPeople(event.data))
  );

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This handler coordinates run lifecycle, tenant readiness, batching, per-record outcomes and finalisation.
export async function syncXeroPeople(input: unknown): Promise<
  Result<
    {
      fetched: number;
      upserted: number;
      skipped: number;
      failed: number;
      runId: string;
      status: "cancelled" | "failed" | "partial_success" | "succeeded";
    },
    SyncXeroPeopleError
  >
> {
  const parsed = SyncXeroPeopleInputSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const context = parsed.data;
  const startedAt = new Date();
  let runId: string | null = null;

  try {
    const existingRun = await database.syncRun.findFirst({
      select: { id: true },
      where: {
        ...scoped(context),
        run_type: "people",
        started_at: { gte: new Date(Date.now() - STALE_RUN_WINDOW_MS) },
        status: "running",
        xero_tenant_id: context.xeroTenantId,
      },
    });

    if (existingRun) {
      const cancelled = await database.syncRun.create({
        data: {
          ...scoped(context),
          completed_at: new Date(),
          error_summary: "Another people sync run is already in progress",
          run_type: "people",
          started_at: startedAt,
          status: "cancelled",
          trigger_type: context.triggerType,
          triggered_by_user_id: context.triggeredByUserId ?? null,
          xero_tenant_id: context.xeroTenantId,
        },
        select: { id: true },
      });
      return {
        ok: true,
        value: emptyResult(cancelled.id, "cancelled"),
      };
    }

    const run = await database.syncRun.create({
      data: {
        ...scoped(context),
        run_type: "people",
        started_at: startedAt,
        status: "running",
        trigger_type: context.triggerType,
        triggered_by_user_id: context.triggeredByUserId ?? null,
        xero_tenant_id: context.xeroTenantId,
      },
      select: { id: true },
    });
    runId = run.id;

    await publishRunStatusChanged(context, run.id, "running");

    const prepared = await prepareTenant(context, run.id);
    if (!prepared.ready) {
      return prepared.result;
    }
    const { xeroTenant } = prepared;

    const counts = emptyCounts();

    const employeesResult = await fetchEmployeesForRegion(
      xeroTenant.payroll_region,
      { xeroTenant }
    );
    if (!employeesResult.ok) {
      if (isBlanketFailure(employeesResult.error)) {
        await completeRun(context, run.id, {
          counts,
          errorSummary: toPlainLanguageMessage(employeesResult.error),
          status: "failed",
        });
        return {
          ok: true,
          value: { ...counts, runId: run.id, status: "failed" },
        };
      }
      await completeRun(context, run.id, {
        counts,
        errorSummary: employeesResult.error.message,
        status: "failed",
      });
      return {
        ok: true,
        value: { ...counts, runId: run.id, status: "failed" },
      };
    }

    const { complete, employees, failures, rawItemCount, seenEmployeeIds } =
      employeesResult.value;
    // fetched reflects every raw item Xero returned for this run, including
    // ones that could not be mapped, so the run's accounting is never
    // silently smaller than what Xero actually sent.
    counts.fetched = rawItemCount;
    if (!complete) {
      log.warn("Xero employee fetch was truncated before completion", {
        clerkOrgId: context.clerkOrgId,
        organisationId: context.organisationId,
        xeroTenantId: context.xeroTenantId,
      });
    }

    const returnedEmployeeIds = seenEmployeeIds
      .map((id) => id.trim())
      .filter((id) => id.length > 0);

    // Any returned non-empty EmployeeID clears its missing marker before
    // record-level validation so a record that fails downstream parsing is
    // still accounted for as seen.
    if (returnedEmployeeIds.length > 0) {
      await database.person.updateMany({
        data: {
          updated_at: new Date(),
          xero_missing_since: null,
        },
        where: {
          clerk_org_id: context.clerkOrgId,
          organisation_id: context.organisationId,
          source_person_key: { in: returnedEmployeeIds },
          source_system: "XERO",
          xero_missing_since: { not: null },
        },
      });
    }

    await recordMappingFailures(context, run.id, failures, counts);

    for (let index = 0; index < employees.length; index += BATCH_SIZE) {
      const runState = await database.syncRun.findFirst({
        select: { cancel_requested_at: true },
        where: { ...scoped(context), id: run.id },
      });
      if (runState?.cancel_requested_at) {
        await completeRun(context, run.id, {
          counts,
          status: "cancelled",
        });
        return {
          ok: true,
          value: { ...counts, runId: run.id, status: "cancelled" },
        };
      }

      const batch = employees.slice(index, index + BATCH_SIZE);
      await processBatch(context, run.id, batch, counts);

      if (index + BATCH_SIZE < employees.length) {
        await sleep(150);
      }
    }

    const postBatchRunState = await database.syncRun.findFirst({
      select: { cancel_requested_at: true },
      where: { ...scoped(context), id: run.id },
    });
    if (postBatchRunState?.cancel_requested_at) {
      await completeRun(context, run.id, {
        counts,
        status: "cancelled",
      });
      return {
        ok: true,
        value: { ...counts, runId: run.id, status: "cancelled" },
      };
    }

    let guardBlocked = false;

    // Absence is inferred only from a complete snapshot.
    if (complete) {
      const unarchivedXeroPeople = await database.person.findMany({
        select: {
          id: true,
          source_person_key: true,
          xero_missing_since: true,
        },
        where: {
          archived_at: null,
          clerk_org_id: context.clerkOrgId,
          organisation_id: context.organisationId,
          source_person_key: { not: null },
          source_system: "XERO",
        },
      });

      const denominator = unarchivedXeroPeople.length;
      if (denominator > 0) {
        const returnedSet = new Set(returnedEmployeeIds);
        const missingPeople = unarchivedXeroPeople.filter(
          (person) =>
            person.source_person_key &&
            !returnedSet.has(person.source_person_key)
        );
        const missingCount = missingPeople.length;

        if (missingCount > 0) {
          const isEmptySnapshot = rawItemCount === 0;
          const isRatioExceeded = missingCount / denominator >= 0.2;
          const isCountExceeded = missingCount > 5;

          if (isEmptySnapshot || isRatioExceeded || isCountExceeded) {
            guardBlocked = true;
            log.warn("Sync people absence guard triggered", {
              archived: 0,
              clerkOrgId: context.clerkOrgId,
              guardBlocked: true,
              missing: missingCount,
              newlyMarked: 0,
              organisationId: context.organisationId,
              xeroTenantId: context.xeroTenantId,
            });
          } else {
            const now = new Date();
            const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
            const toMarkIds: string[] = [];
            const toArchiveIds: string[] = [];

            for (const person of missingPeople) {
              if (person.xero_missing_since) {
                const missingSinceMs = new Date(
                  person.xero_missing_since
                ).getTime();
                const ageMs = now.getTime() - missingSinceMs;
                if (ageMs >= TWENTY_FOUR_HOURS_MS) {
                  toArchiveIds.push(person.id);
                }
              } else {
                toMarkIds.push(person.id);
              }
            }

            if (toMarkIds.length > 0 || toArchiveIds.length > 0) {
              await database.$transaction(async (tx) => {
                if (toMarkIds.length > 0) {
                  await tx.person.updateMany({
                    data: {
                      updated_at: now,
                      xero_missing_since: now,
                    },
                    where: {
                      clerk_org_id: context.clerkOrgId,
                      id: { in: toMarkIds },
                      organisation_id: context.organisationId,
                    },
                  });
                }
                if (toArchiveIds.length > 0) {
                  await tx.person.updateMany({
                    data: {
                      archived_at: now,
                      is_active: false,
                      updated_at: now,
                    },
                    where: {
                      clerk_org_id: context.clerkOrgId,
                      id: { in: toArchiveIds },
                      organisation_id: context.organisationId,
                    },
                  });
                }
              });
            }

            log.info("Sync people absence check completed", {
              archived: toArchiveIds.length,
              clerkOrgId: context.clerkOrgId,
              guardBlocked: false,
              missing: missingCount,
              newlyMarked: toMarkIds.length,
              organisationId: context.organisationId,
              xeroTenantId: context.xeroTenantId,
            });
          }
        }
      }
    }

    await database.xeroTenant.updateMany({
      data: {
        last_people_sync_at: new Date(),
        last_sync_error_code: null,
        last_sync_error_message: null,
        people_stale_since: null,
      },
      where: { ...scoped(context), id: context.xeroTenantId },
    });

    const finalStatus =
      guardBlocked || counts.failed > 0 ? "partial_success" : "succeeded";
    const errorSummary = guardBlocked
      ? "Missing person guard threshold exceeded"
      : undefined;

    await completeRun(context, run.id, {
      counts,
      errorSummary,
      status: finalStatus,
    });
    if (finalStatus === "succeeded") {
      await captureInitialSyncCompleted(context);
    }

    return {
      ok: true,
      value: { ...counts, runId: run.id, status: finalStatus },
    };
  } catch (error) {
    log.error("Unhandled exception in syncXeroPeople:", { error });
    if (runId) {
      await completeRun(context, runId, {
        counts: emptyCounts(),
        errorSummary:
          error instanceof Error ? error.message : "Unhandled exception",
        status: "failed",
      });
    }
    return {
      error: {
        code: "unknown_error",
        message: "Failed to sync Xero employees.",
      },
      ok: false,
    };
  }
}

async function processBatch(
  context: SyncXeroPeopleInput,
  runId: string,
  batch: XeroEmployee[],
  counts: { upserted: number; failed: number }
) {
  for (const employee of batch) {
    const validation = validateEmployee(employee);
    if (!validation.valid) {
      await recordFailure(context, {
        errorCode: "validation_error",
        errorMessage: validation.message,
        rawPayload: employee.rawPayload,
        runId,
        sourceId: employee.employeeId || "unknown",
      });
      counts.failed += 1;
      continue;
    }

    try {
      const raw =
        employee.email ||
        `${employee.firstName}.${employee.lastName}@${noemailFallbackDomain}`;
      const email = raw.toLowerCase();
      const employmentType = mapEmploymentType(employee.employmentType);
      const personType =
        employmentType === "contractor" ? "contractor" : "employee";
      const startDate = optionalValidDate(employee.startDate);
      await database.person.upsert({
        create: {
          clerk_org_id: context.clerkOrgId,
          display_name: `${employee.firstName} ${employee.lastName}`,
          email,
          employment_type: employmentType,
          first_name: employee.firstName,
          is_active: employee.status?.toUpperCase() === "ACTIVE",
          job_title: employee.jobTitle ?? null,
          last_name: employee.lastName,
          organisation_id: context.organisationId,
          person_type: personType,
          source_person_key: employee.employeeId,
          source_system: "XERO",
          start_date: startDate,
          xero_employee_id: employee.employeeId,
        },
        update: {
          // The employee was returned by Xero in this run, so any prior
          // archival (e.g. from a destructive disconnect) no longer applies.
          // is_active is mapped independently below and reflects Xero's
          // employment status, not whether the person is archived.
          archived_at: null,
          display_name: `${employee.firstName} ${employee.lastName}`,
          email,
          employment_type: employmentType,
          first_name: employee.firstName,
          is_active: employee.status?.toUpperCase() === "ACTIVE",
          job_title: employee.jobTitle ?? null,
          last_name: employee.lastName,
          person_type: personType,
          start_date: startDate,
          updated_at: new Date(),
          xero_employee_id: employee.employeeId,
          xero_missing_since: null,
        },
        where: {
          clerk_org_id: context.clerkOrgId,
          organisation_id_source_system_source_person_key: {
            organisation_id: context.organisationId,
            source_person_key: employee.employeeId,
            source_system: "XERO",
          },
        },
      });
      counts.upserted += 1;
    } catch (error) {
      await recordFailure(context, {
        errorCode: "db_error",
        errorMessage:
          error instanceof Error
            ? error.message
            : "Failed to upsert person record.",
        rawPayload: employee.rawPayload,
        runId,
        sourceId: employee.employeeId,
      });
      counts.failed += 1;
    }
  }
}

// Mapping failures happen before an employee ever reaches XeroEmployee shape
// (e.g. an unparseable record, or one with no resolvable EmployeeID), so they
// are recorded distinctly from handler validation failures (validateEmployee,
// below) and persistence failures (the db_error branch in processBatch).
async function recordMappingFailures(
  context: SyncXeroPeopleInput,
  runId: string,
  failures: XeroEmployeeMapFailure[],
  counts: { failed: number }
) {
  for (const failure of failures) {
    await recordFailure(context, {
      errorCode: "mapping_error",
      errorMessage: failure.reason,
      rawPayload: failure.rawPayload,
      runId,
      sourceId: failure.rawEmployeeId ?? "unknown",
    });
    counts.failed += 1;
  }
}

function validateEmployee(
  employee: XeroEmployee
): { valid: true } | { valid: false; message: string } {
  if (!(employee.employeeId && UUID_REGEX.test(employee.employeeId))) {
    return { message: "Invalid or missing Employee ID", valid: false };
  }
  if (!employee.firstName || employee.firstName.trim().length === 0) {
    return { message: "First name is required", valid: false };
  }
  if (!employee.lastName || employee.lastName.trim().length === 0) {
    return { message: "Last name is required", valid: false };
  }
  return { valid: true };
}

function optionalValidDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function mapEmploymentType(
  value: string | null
): "employee" | "contractor" | "director" | "offshore" {
  if (!value) {
    return "employee";
  }
  const type = value.toLowerCase().trim();
  if (type === "contractor") {
    return "contractor";
  }
  if (type === "director") {
    return "director";
  }
  if (type === "offshore") {
    return "offshore";
  }
  return "employee";
}

async function recordFailure(
  context: SyncXeroPeopleInput,
  input: {
    errorCode: string;
    errorMessage: string;
    rawPayload: unknown;
    runId: string;
    sourceId: string;
  }
) {
  await database.failedRecord.create({
    data: {
      clerk_org_id: context.clerkOrgId,
      entity_type: "people",
      error_code: input.errorCode,
      error_message: input.errorMessage,
      organisation_id: context.organisationId,
      raw_payload: toPrismaJsonValue(input.rawPayload),
      record_type: "people",
      source_id: input.sourceId,
      source_remote_id: input.sourceId,
      sync_run_id: input.runId,
    },
  });
}

async function completeRun(
  context: SyncXeroPeopleInput,
  runId: string,
  input: {
    counts: {
      fetched: number;
      upserted: number;
      skipped: number;
      failed: number;
    };
    errorSummary?: string;
    status: "cancelled" | "failed" | "partial_success" | "succeeded";
  }
) {
  await database.syncRun.updateMany({
    data: {
      completed_at: new Date(),
      error_summary: input.errorSummary ?? null,
      records_failed: input.counts.failed,
      records_fetched: input.counts.fetched,
      records_skipped: input.counts.skipped,
      records_synced: input.counts.upserted,
      records_upserted: input.counts.upserted,
      status: input.status,
    },
    where: { ...scoped(context), id: runId },
  });
  await publishRunStatusChanged(context, runId, input.status);
}

// Load the tenant, confirm the connection is usable, and refresh its access token
// proactively before any Xero read so a token that lapsed since the last sync does not fail
// the run. Terminal cases complete the run and are returned as a ready:false result.
async function prepareTenant(
  context: SyncXeroPeopleInput,
  runId: string
): Promise<
  | {
      ready: false;
      result: {
        ok: true;
        value: ReturnType<typeof emptyResult>;
      };
    }
  | {
      ready: true;
      xeroTenant: NonNullable<Awaited<ReturnType<typeof loadXeroTenant>>>;
    }
> {
  const loadedTenant = await loadXeroTenant(context);
  if (loadedTenant?.sync_paused_at) {
    await completeRun(context, runId, {
      counts: emptyCounts(),
      errorSummary: "Tenant sync is paused for this Xero connection",
      status: "cancelled",
    });
    return {
      ready: false,
      result: { ok: true, value: emptyResult(runId, "cancelled") },
    };
  }
  if (!loadedTenant) {
    await completeRun(context, runId, {
      counts: emptyCounts(),
      errorSummary: "Xero connection not active",
      status: "failed",
    });
    return {
      ready: false,
      result: { ok: true, value: emptyResult(runId, "failed") },
    };
  }
  const freshness = await ensureFreshXeroConnection({
    clerkOrgId: context.clerkOrgId,
    connectionId: loadedTenant.xero_connection_id,
    organisationId: context.organisationId,
  });
  if (!freshness.ok) {
    await completeRun(context, runId, {
      counts: emptyCounts(),
      errorSummary: freshness.error.message,
      status: "failed",
    });
    return {
      ready: false,
      result: { ok: true, value: emptyResult(runId, "failed") },
    };
  }
  // Reload so the run uses the freshly persisted access token, not the stale one.
  const xeroTenant = freshness.value.refreshed
    ? await loadXeroTenant(context)
    : loadedTenant;
  if (!xeroTenant) {
    await completeRun(context, runId, {
      counts: emptyCounts(),
      errorSummary: "Xero connection not active",
      status: "failed",
    });
    return {
      ready: false,
      result: { ok: true, value: emptyResult(runId, "failed") },
    };
  }
  return { ready: true, xeroTenant };
}

function loadXeroTenant(context: SyncXeroPeopleInput) {
  return database.xeroTenant.findFirst({
    include: {
      xero_connection: {
        select: {
          access_token_auth_tag: true,
          access_token_encrypted: true,
          access_token_iv: true,
          expires_at: true,
          last_refreshed_at: true,
          revoked_at: true,
          status: true,
        },
      },
    },
    where: {
      clerk_org_id: context.clerkOrgId,
      id: context.xeroTenantId,
      organisation_id: context.organisationId,
    },
  });
}

function isBlanketFailure(error: XeroWriteError): boolean {
  return error.code === "auth_error" || error.code === "rate_limit_error";
}

async function publishRunStatusChanged(
  context: SyncXeroPeopleInput,
  runId: string,
  status: string
) {
  try {
    await publishOrganisationNotificationEvent(
      {
        clerkOrgId: context.clerkOrgId,
        organisationId: context.organisationId,
      },
      {
        payload: {
          organisationId: context.organisationId,
          runId,
          runType: "people",
          status,
          xeroTenantId: context.xeroTenantId,
        },
        type: "sync.run_status_changed",
      }
    );
  } catch (error) {
    log.error("Failed to publish sync run status notification", {
      error,
      organisationId: context.organisationId,
      runId,
    });
  }
}

function emptyCounts() {
  return {
    failed: 0,
    fetched: 0,
    skipped: 0,
    upserted: 0,
  };
}

function emptyResult(
  runId: string,
  status: "cancelled" | "failed" | "partial_success" | "succeeded"
) {
  return {
    failed: 0,
    fetched: 0,
    runId,
    skipped: 0,
    status,
    upserted: 0,
  };
}

function toPrismaJsonValue(
  value: unknown
): Exclude<JsonValue, null> | typeof Prisma.JsonNull {
  const jsonValue = toJsonValue(value);
  return jsonValue === null ? Prisma.JsonNull : jsonValue;
}

function toJsonValue(value: unknown): JsonValue {
  if (value === null || value === undefined) {
    return null;
  }
  if (
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => toJsonValue(item));
  }
  if (typeof value === "object") {
    const output = Object.create(null) as Record<string, JsonValue>;
    for (const [key, item] of Object.entries(value)) {
      if (key !== "__proto__" && key !== "constructor" && key !== "prototype") {
        Reflect.set(output, key, toJsonValue(item));
      }
    }
    return output;
  }
  return String(value);
}

function validationError(
  error: z.ZodError
): Result<never, SyncXeroPeopleError> {
  return {
    error: {
      code: "validation_error",
      message: error.issues[0]?.message ?? "Invalid sync people request.",
    },
    ok: false,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
