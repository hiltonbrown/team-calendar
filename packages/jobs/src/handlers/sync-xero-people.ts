import "server-only";

import type { Result } from "@repo/core";
import { database } from "@repo/database";
import { Prisma } from "@repo/database/generated/client";
import { publishOrganisationNotificationEvent } from "@repo/notifications";
import { log } from "@repo/observability/log";
import {
  ensureFreshXeroConnection,
  fetchEmployeesForRegion,
  toPlainLanguageMessage,
  type XeroEmployee,
  type XeroWriteError,
} from "@repo/xero";
import type { InngestFunction } from "inngest";
import { z } from "zod";
import { inngest } from "../client";

const SyncXeroPeopleInputSchema = z.object({
  clerkOrgId: z.string().min(1),
  organisationId: z.string().uuid(),
  triggerType: z.enum(["scheduled", "manual", "webhook"]).default("manual"),
  triggeredByUserId: z.string().min(1).nullable().optional(),
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

  try {
    const existingRun = await database.syncRun.findFirst({
      where: {
        ...scoped(context),
        run_type: "people",
        status: "running",
        xero_tenant_id: context.xeroTenantId,
      },
      select: { id: true },
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

    publishRunStatusChanged(context, run.id, "running");

    const prepared = await prepareTenant(context, run.id);
    if (!prepared.ready) {
      return prepared.result;
    }
    const xeroTenant = prepared.xeroTenant;

    const counts = emptyCounts();

    if (
      xeroTenant.payroll_region === "NZ" ||
      xeroTenant.payroll_region === "UK"
    ) {
      log.info(
        `Sync people skipped for region ${xeroTenant.payroll_region} as it is not yet available.`
      );
      await completeRun(context, run.id, {
        counts,
        errorSummary: `${xeroTenant.payroll_region} payroll employee reads are not yet available.`,
        status: "succeeded",
      });
      return {
        ok: true,
        value: { ...counts, runId: run.id, status: "succeeded" },
      };
    }

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

    const employees = employeesResult.value.employees;
    counts.fetched = employees.length;

    for (let index = 0; index < employees.length; index += BATCH_SIZE) {
      const runState = await database.syncRun.findFirst({
        where: { ...scoped(context), id: run.id },
        select: { cancel_requested_at: true },
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

    const finalStatus = counts.failed > 0 ? "partial_success" : "succeeded";
    await completeRun(context, run.id, {
      counts,
      status: finalStatus,
    });

    return {
      ok: true,
      value: { ...counts, runId: run.id, status: finalStatus },
    };
  } catch (error) {
    log.error("Unhandled exception in syncXeroPeople:", { error });
    return {
      ok: false,
      error: {
        code: "unknown_error",
        message: "Failed to sync Xero employees.",
      },
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
        `${employee.firstName}.${employee.lastName}@noemail.leavesync.app`;
      const email = raw.toLowerCase();
      await database.person.upsert({
        where: {
          organisation_id_source_system_source_person_key: {
            organisation_id: context.organisationId,
            source_system: "XERO",
            source_person_key: employee.employeeId,
          },
        },
        update: {
          first_name: employee.firstName,
          last_name: employee.lastName,
          email,
          employment_type: mapEmploymentType(employee.employmentType),
          is_active: employee.status === "ACTIVE",
          job_title: employee.jobTitle ?? null,
          start_date: employee.startDate ? new Date(employee.startDate) : null,
          display_name: `${employee.firstName} ${employee.lastName}`,
          xero_employee_id: employee.employeeId,
          updated_at: new Date(),
        },
        create: {
          clerk_org_id: context.clerkOrgId,
          organisation_id: context.organisationId,
          source_system: "XERO",
          source_person_key: employee.employeeId,
          first_name: employee.firstName,
          last_name: employee.lastName,
          email,
          employment_type: mapEmploymentType(employee.employmentType),
          is_active: employee.status === "ACTIVE",
          job_title: employee.jobTitle ?? null,
          start_date: employee.startDate ? new Date(employee.startDate) : null,
          display_name: `${employee.firstName} ${employee.lastName}`,
          xero_employee_id: employee.employeeId,
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

function validateEmployee(
  employee: XeroEmployee
): { valid: true } | { valid: false; message: string } {
  if (!(employee.employeeId && UUID_REGEX.test(employee.employeeId))) {
    return { valid: false, message: "Invalid or missing Employee ID" };
  }
  if (!employee.firstName || employee.firstName.trim().length === 0) {
    return { valid: false, message: "First name is required" };
  }
  if (!employee.lastName || employee.lastName.trim().length === 0) {
    return { valid: false, message: "Last name is required" };
  }
  return { valid: true };
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
      organisation_id: context.organisationId,
      sync_run_id: input.runId,
      entity_type: "people",
      record_type: "people",
      source_id: input.sourceId,
      source_remote_id: input.sourceId,
      error_code: input.errorCode,
      error_message: input.errorMessage,
      raw_payload: toPrismaJsonValue(input.rawPayload),
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
      records_upserted: input.counts.upserted,
      records_synced: input.counts.upserted,
      status: input.status,
    },
    where: { ...scoped(context), id: runId },
  });
  publishRunStatusChanged(context, runId, input.status);
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
  const notActive = async (): Promise<{
    ready: false;
    result: { ok: true; value: ReturnType<typeof emptyResult> };
  }> => {
    await completeRun(context, runId, {
      counts: emptyCounts(),
      errorSummary: "Xero connection not active",
      status: "failed",
    });
    return {
      ready: false,
      result: { ok: true, value: emptyResult(runId, "failed") },
    };
  };
  if (!loadedTenant) {
    return await notActive();
  }
  const freshness = await ensureFreshXeroConnection({
    clerkOrgId: context.clerkOrgId,
    connectionId: loadedTenant.xero_connection_id,
    organisationId: context.organisationId,
  });
  if (!freshness.ok) {
    return await notActive();
  }
  // Reload so the run uses the freshly persisted access token, not the stale one.
  const xeroTenant = freshness.value.refreshed
    ? await loadXeroTenant(context)
    : loadedTenant;
  if (!xeroTenant) {
    return await notActive();
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
          status: true,
          revoked_at: true,
        },
      },
    },
    where: {
      clerk_org_id: context.clerkOrgId,
      organisation_id: context.organisationId,
      id: context.xeroTenantId,
    },
  });
}

function isBlanketFailure(error: XeroWriteError): boolean {
  return error.code === "auth_error" || error.code === "rate_limit_error";
}

function publishRunStatusChanged(
  context: SyncXeroPeopleInput,
  runId: string,
  status: string
) {
  publishOrganisationNotificationEvent(
    { organisationId: context.organisationId },
    {
      type: "sync.run_status_changed",
      payload: {
        organisationId: context.organisationId,
        runId,
        runType: "people",
        status,
        xeroTenantId: context.xeroTenantId,
      },
    }
  );
}

function scoped(input: { clerkOrgId: string; organisationId: string }) {
  return {
    clerk_org_id: input.clerkOrgId,
    organisation_id: input.organisationId,
  };
}

function emptyCounts() {
  return {
    fetched: 0,
    upserted: 0,
    skipped: 0,
    failed: 0,
  };
}

function emptyResult(
  runId: string,
  status: "cancelled" | "failed" | "partial_success" | "succeeded"
) {
  return {
    fetched: 0,
    upserted: 0,
    skipped: 0,
    failed: 0,
    runId,
    status,
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
    ok: false,
    error: {
      code: "validation_error",
      message: error.issues[0]?.message ?? "Invalid sync people request.",
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
