import "server-only";

import {
  deriveXeroStableSourceKey,
  type InboundLeaveApprovalStatus,
  materialiseAvailabilityPublication,
  normaliseInboundLeaveRecord,
} from "@repo/availability";
import type { Result } from "@repo/core";
import { database } from "@repo/database";
import { Prisma } from "@repo/database/generated/client";
import { publishOrganisationNotificationEvent } from "@repo/notifications";
import { log } from "@repo/observability/log";
import {
  fetchLeaveRecordsForRegion,
  toPlainLanguageMessage,
  type XeroLeaveRecord,
  type XeroLeaveRecordStatus,
  type XeroWriteError,
} from "@repo/xero";
import type { InngestFunction } from "inngest";
import { z } from "zod";
import { inngest } from "../client";

const SyncXeroLeaveRecordsInputSchema = z.object({
  clerkOrgId: z.string().min(1),
  organisationId: z.string().uuid(),
  triggerType: z.enum(["scheduled", "manual", "webhook"]).default("manual"),
  triggeredByUserId: z.string().min(1).nullable().optional(),
  xeroTenantId: z.string().uuid(),
});

export type SyncXeroLeaveRecordsInput = z.infer<
  typeof SyncXeroLeaveRecordsInputSchema
>;

export type SyncXeroLeaveRecordsError =
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
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const UUID_REGEX = /^[0-9a-fA-F-]{36}$/;
const FailedRecordTypeSchema = z.enum([
  "people",
  "leave_records",
  "leave_balances",
  "approval_state_reconciliation",
  "leave",
  "annual_leave",
  "personal_leave",
  "holiday",
  "sick_leave",
  "long_service_leave",
  "unpaid_leave",
  "public_holiday",
  "wfh",
  "travel",
  "travelling",
  "training",
  "client_site",
  "another_office",
  "offsite_meeting",
  "contractor_unavailable",
  "limited_availability",
  "alternative_contact",
  "other",
  "leave_request",
]);

interface Counts {
  archived: number;
  failed: number;
  fetched: number;
  skipped: number;
  upserted: number;
}

interface ProcessedLeaveRecord {
  changed: boolean;
  personId: string;
  sourceRemoteId: string;
}

type SyncStatus = "cancelled" | "failed" | "partial_success" | "succeeded";
type SyncXeroLeaveRecordsResult = Result<
  Counts & {
    runId: string;
    status: SyncStatus;
  },
  SyncXeroLeaveRecordsError
>;
type XeroTenant = NonNullable<Awaited<ReturnType<typeof loadXeroTenant>>>;

export const syncXeroLeaveRecordsFunction: InngestFunction.Any =
  inngest.createFunction(
    {
      cancelOn: [
        {
          event: "cancel-sync-run",
          if: "async.data.runId == event.data.runId",
        },
      ],
      id: "sync-xero-leave-records",
      triggers: { event: "sync-xero-leave-records" },
    },
    async ({ event, step }) =>
      await step.run("sync-leave-records", async () =>
        syncXeroLeaveRecords(event.data)
      )
  );

export async function syncXeroLeaveRecords(
  input: unknown
): Promise<SyncXeroLeaveRecordsResult> {
  const parsed = SyncXeroLeaveRecordsInputSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const context = parsed.data;
  const startedAt = new Date();

  try {
    const duplicateRun = await cancelDuplicateRun(context, startedAt);
    if (duplicateRun) {
      return { ok: true, value: emptyResult(duplicateRun.id, "cancelled") };
    }

    const run = await createRun(context, startedAt);

    publishRunStatusChanged(context, run.id, "running");

    const tenantReadiness = await ensureTenantReady(context, run.id);
    if (!tenantReadiness.ready) {
      return tenantReadiness.result;
    }
    const { xeroTenant } = tenantReadiness;

    const counts = emptyCounts();
    const skippedRegion = await skipUnsupportedRegion(
      context,
      run.id,
      xeroTenant,
      counts
    );
    if (skippedRegion) {
      return skippedRegion;
    }

    const leaveRecordsResult = await fetchLeaveRecordsForRegion(
      xeroTenant.payroll_region,
      { xeroTenant }
    );
    if (!leaveRecordsResult.ok) {
      await completeRun(context, run.id, {
        counts,
        errorSummary: isBlanketFailure(leaveRecordsResult.error)
          ? toPlainLanguageMessage(leaveRecordsResult.error)
          : leaveRecordsResult.error.message,
        status: "failed",
      });
      return {
        ok: true,
        value: { ...counts, runId: run.id, status: "failed" },
      };
    }

    const fetched = leaveRecordsResult.value.leaveRecords;
    counts.fetched = fetched.length;
    const processed: ProcessedLeaveRecord[] = [];

    for (let index = 0; index < fetched.length; index += BATCH_SIZE) {
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

      const batch = fetched.slice(index, index + BATCH_SIZE);
      for (const leaveRecord of batch) {
        const result = await processLeaveRecord(
          context,
          run.id,
          xeroTenant.id,
          leaveRecord
        );
        if (result) {
          processed.push(result);
          counts.upserted += 1;
        } else {
          counts.failed += 1;
        }
      }

      if (index + BATCH_SIZE < fetched.length) {
        await sleep(150);
      }
    }

    const stale = await archiveStaleRecords(
      context,
      fetched.map((record) => record.leaveApplicationId).filter(Boolean)
    );
    counts.archived = stale.archived;
    const affectedPersonIds = new Set([
      ...processed
        .filter((record) => record.changed)
        .map((record) => record.personId),
      ...stale.personIds,
    ]);
    await enqueueFeedRebuilds(context, [...affectedPersonIds]);

    await database.xeroTenant.updateMany({
      data: {
        last_leave_records_sync_at: new Date(),
        last_sync_error_code: null,
        last_sync_error_message: null,
        leave_records_stale_since: null,
      },
      where: { ...scoped(context), id: context.xeroTenantId },
    });

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
    log.error("Unhandled exception in syncXeroLeaveRecords:", { error });
    return {
      ok: false,
      error: {
        code: "unknown_error",
        message: "Failed to sync Xero leave records.",
      },
    };
  }
}

async function cancelDuplicateRun(
  context: SyncXeroLeaveRecordsInput,
  startedAt: Date
): Promise<{ id: string } | null> {
  const existingRun = await database.syncRun.findFirst({
    where: {
      ...scoped(context),
      run_type: "leave_records",
      status: "running",
      xero_tenant_id: context.xeroTenantId,
    },
    select: { id: true },
  });
  if (!existingRun) {
    return null;
  }

  return await database.syncRun.create({
    data: {
      ...scoped(context),
      completed_at: new Date(),
      error_summary: "Another leave records sync run is already in progress",
      run_type: "leave_records",
      started_at: startedAt,
      status: "cancelled",
      trigger_type: context.triggerType,
      triggered_by_user_id: context.triggeredByUserId ?? null,
      xero_tenant_id: context.xeroTenantId,
    },
    select: { id: true },
  });
}

function createRun(context: SyncXeroLeaveRecordsInput, startedAt: Date) {
  return database.syncRun.create({
    data: {
      ...scoped(context),
      entity_type: "leave_records",
      run_type: "leave_records",
      started_at: startedAt,
      status: "running",
      trigger_type: context.triggerType,
      triggered_by_user_id: context.triggeredByUserId ?? null,
      xero_tenant_id: context.xeroTenantId,
    },
    select: { id: true },
  });
}

async function ensureTenantReady(
  context: SyncXeroLeaveRecordsInput,
  runId: string
): Promise<
  | { ready: true; xeroTenant: XeroTenant }
  | { ready: false; result: SyncXeroLeaveRecordsResult }
> {
  const xeroTenant = await loadXeroTenant(context);
  if (xeroTenant?.sync_paused_at) {
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
  if (!(xeroTenant && connectionActive(xeroTenant.xero_connection))) {
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

async function skipUnsupportedRegion(
  context: SyncXeroLeaveRecordsInput,
  runId: string,
  xeroTenant: XeroTenant,
  counts: Counts
): Promise<SyncXeroLeaveRecordsResult | null> {
  if (
    xeroTenant.payroll_region !== "NZ" &&
    xeroTenant.payroll_region !== "UK"
  ) {
    return null;
  }

  log.info(
    `Sync leave records skipped for region ${xeroTenant.payroll_region} as it is not yet available.`
  );
  await completeRun(context, runId, {
    counts,
    errorSummary: `${xeroTenant.payroll_region} payroll leave reads are not yet available.`,
    status: "succeeded",
  });
  return {
    ok: true,
    value: { ...counts, runId, status: "succeeded" },
  };
}

async function processLeaveRecord(
  context: SyncXeroLeaveRecordsInput,
  runId: string,
  xeroTenantId: string,
  leaveRecord: XeroLeaveRecord
): Promise<ProcessedLeaveRecord | null> {
  const validation = validateLeaveRecord(leaveRecord);
  if (!validation.valid) {
    await recordFailure(context, {
      errorCode: "validation_error",
      errorMessage: validation.message,
      rawPayload: leaveRecord.rawPayload,
      recordType: "leave_records",
      runId,
      sourceId: leaveRecord.leaveApplicationId || "unknown",
    });
    return null;
  }

  try {
    const person = await database.person.findFirst({
      where: {
        ...scoped(context),
        archived_at: null,
        xero_employee_id: leaveRecord.employeeId,
      },
      select: {
        default_privacy_mode: true,
        id: true,
        include_in_feeds_by_default: true,
      },
    });
    if (!person) {
      await recordFailure(context, {
        errorCode: "person_not_found",
        errorMessage: "No scoped person exists for the Xero employee.",
        rawPayload: leaveRecord.rawPayload,
        recordType: "leave_records",
        runId,
        sourceId: leaveRecord.leaveApplicationId,
      });
      return null;
    }

    const startsAt = parseXeroDate(leaveRecord.startDate);
    const endsAt = parseXeroDate(leaveRecord.endDate);
    const sourceLastModifiedAt = leaveRecord.updatedDateUtc
      ? parseOptionalDateTime(leaveRecord.updatedDateUtc)
      : null;
    const approvalStatus = mapApprovalStatus(leaveRecord.status);
    if (
      !(
        startsAt &&
        endsAt &&
        sourceLastModifiedAt !== undefined &&
        approvalStatus
      )
    ) {
      await recordFailure(context, {
        errorCode: "validation_error",
        errorMessage: "Leave record contains invalid dates or status.",
        rawPayload: leaveRecord.rawPayload,
        recordType: "leave_records",
        runId,
        sourceId: leaveRecord.leaveApplicationId,
      });
      return null;
    }

    const normalised = normaliseInboundLeaveRecord({
      approvalStatus,
      clerkOrgId: context.clerkOrgId,
      endsAt,
      leaveTypeId: leaveRecord.leaveTypeId,
      leaveTypeName: leaveRecord.leaveTypeName,
      organisationId: context.organisationId,
      personId: person.id,
      provider: "xero",
      rawPayload: leaveRecord.rawPayload,
      sourceLastModifiedAt,
      sourceRemoteId: leaveRecord.leaveApplicationId,
      stableSourceKey: deriveXeroStableSourceKey({
        employeeId: leaveRecord.employeeId,
        endsAt,
        leaveTypeId: leaveRecord.leaveTypeId,
        startsAt,
        units: leaveRecord.units,
        xeroTenantId,
      }),
      startsAt,
      title: leaveRecord.title,
      units: leaveRecord.units,
    });

    const existing = await database.availabilityRecord.findFirst({
      where: {
        ...scoped(context),
        source_remote_id: normalised.sourceRemoteId,
        source_type: normalised.sourceType,
      },
      select: { id: true, source_remote_hash: true },
    });
    const changed =
      existing?.source_remote_hash !== normalised.sourceRemoteHash;
    const data = {
      all_day: normalised.allDay,
      approval_status: normalised.approvalStatus,
      archived_at: normalised.publishStatus === "archived" ? new Date() : null,
      contactability: normalised.contactability,
      derived_uid_key: normalised.derivedUidKey,
      ends_at: normalised.endsAt,
      include_in_feed:
        normalised.includeInFeed && person.include_in_feeds_by_default,
      person_id: normalised.personId,
      privacy_mode: person.default_privacy_mode,
      publish_status: normalised.publishStatus,
      record_type: normalised.recordType,
      source_last_modified_at: normalised.sourceLastModifiedAt,
      source_payload_json: toPrismaJsonValue(normalised.rawPayload),
      source_remote_hash: normalised.sourceRemoteHash,
      starts_at: normalised.startsAt,
      title: normalised.title,
      updated_at: new Date(),
    };

    const recordId = existing?.id;
    if (recordId) {
      await database.availabilityRecord.updateMany({
        data,
        where: { ...scoped(context), id: recordId },
      });
    } else {
      const created = await database.availabilityRecord.create({
        data: {
          ...data,
          clerk_org_id: context.clerkOrgId,
          organisation_id: context.organisationId,
          source_remote_id: normalised.sourceRemoteId,
          source_type: normalised.sourceType,
        },
        select: { id: true },
      });
      await materialiseSyncedPublication(context, created.id);
    }
    if (recordId) {
      await materialiseSyncedPublication(context, recordId);
    }
    return {
      changed,
      personId: person.id,
      sourceRemoteId: normalised.sourceRemoteId,
    };
  } catch (error) {
    await recordFailure(context, {
      errorCode: "db_error",
      errorMessage:
        error instanceof Error
          ? error.message
          : "Failed to upsert availability record.",
      rawPayload: leaveRecord.rawPayload,
      recordType: "leave_records",
      runId,
      sourceId: leaveRecord.leaveApplicationId || "unknown",
    });
    return null;
  }
}

async function archiveStaleRecords(
  context: SyncXeroLeaveRecordsInput,
  fetchedRemoteIds: string[]
): Promise<{ archived: number; personIds: string[] }> {
  const stale = await database.availabilityRecord.findMany({
    where: {
      ...scoped(context),
      archived_at: null,
      source_remote_id:
        fetchedRemoteIds.length > 0
          ? { notIn: fetchedRemoteIds }
          : { not: null },
      source_type: "xero_leave",
    },
    select: { id: true, person_id: true },
  });
  if (stale.length === 0) {
    return { archived: 0, personIds: [] };
  }

  await database.availabilityRecord.updateMany({
    data: {
      archived_at: new Date(),
      include_in_feed: false,
      publish_status: "archived",
      updated_at: new Date(),
    },
    where: {
      ...scoped(context),
      id: { in: stale.map((record) => record.id) },
    },
  });

  // Materialise publications one record at a time. A single failure here must not
  // abort the whole sync run (record-level inbound failures are tolerated); the
  // record is already archived, the failure is logged below, and the publication
  // is corrected on the next successful materialisation for the record.
  for (const record of stale) {
    try {
      await materialiseSyncedPublication(context, record.id);
    } catch (error) {
      log.error("Failed to materialise publication for archived leave record", {
        availabilityRecordId: record.id,
        clerkOrgId: context.clerkOrgId,
        error,
        organisationId: context.organisationId,
      });
    }
  }

  return {
    archived: stale.length,
    personIds: [...new Set(stale.map((record) => record.person_id))],
  };
}

async function materialiseSyncedPublication(
  context: SyncXeroLeaveRecordsInput,
  availabilityRecordId: string
): Promise<void> {
  const publication = await materialiseAvailabilityPublication({
    availabilityRecordId,
    clerkOrgId: context.clerkOrgId,
    organisationId: context.organisationId,
  });
  if (!publication.ok) {
    throw new Error(publication.error.message);
  }
}

async function enqueueFeedRebuilds(
  context: SyncXeroLeaveRecordsInput,
  personIds: string[]
) {
  if (personIds.length === 0) {
    return;
  }

  const people = await database.person.findMany({
    where: { ...scoped(context), id: { in: personIds } },
    select: { id: true, team_id: true },
  });
  const teamIds = people
    .map((person) => person.team_id)
    .filter((teamId): teamId is string => Boolean(teamId));
  const feeds = await database.feed.findMany({
    where: {
      ...scoped(context),
      archived_at: null,
      status: "active",
      scopes: {
        some: {
          OR: [
            { scope_type: "org" },
            { scope_type: "person", scope_value: { in: personIds } },
            ...(teamIds.length > 0
              ? [{ scope_type: "team" as const, scope_value: { in: teamIds } }]
              : []),
          ],
          clerk_org_id: context.clerkOrgId,
          organisation_id: context.organisationId,
        },
      },
    },
    select: { id: true },
  });

  for (const feed of feeds) {
    await inngest.send({
      data: {
        clerkOrgId: context.clerkOrgId,
        feedId: feed.id,
        organisationId: context.organisationId,
        reason: "xero_leave_records_synced",
      },
      name: "rebuild-feed-cache",
    });
  }
}

function validateLeaveRecord(
  leaveRecord: XeroLeaveRecord
): { valid: true } | { message: string; valid: false } {
  if (
    !(
      leaveRecord.leaveApplicationId &&
      UUID_REGEX.test(leaveRecord.leaveApplicationId)
    )
  ) {
    return { message: "Invalid or missing Leave Application ID", valid: false };
  }
  if (!(leaveRecord.employeeId && UUID_REGEX.test(leaveRecord.employeeId))) {
    return { message: "Invalid or missing Employee ID", valid: false };
  }
  if (!leaveRecord.leaveTypeId.trim()) {
    return { message: "Leave type is required", valid: false };
  }
  if (leaveRecord.units <= 0) {
    return { message: "Leave units must be greater than zero", valid: false };
  }
  return { valid: true };
}

function mapApprovalStatus(
  status: XeroLeaveRecordStatus
): InboundLeaveApprovalStatus | null {
  switch (status) {
    case "APPROVED":
      return "approved";
    case "DELETED":
      return "cancelled";
    case "REJECTED":
      return "declined";
    case "SUBMITTED":
      return "submitted";
    case "WITHDRAWN":
      return "withdrawn";
    case "UNKNOWN":
      return null;
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

function parseXeroDate(value: string): Date | null {
  if (!DATE_ONLY_REGEX.test(value)) {
    return parseOptionalDateTime(value);
  }
  return parseOptionalDateTime(`${value}T00:00:00.000Z`);
}

function parseOptionalDateTime(value: string): Date | null {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function recordFailure(
  context: SyncXeroLeaveRecordsInput,
  input: {
    errorCode: string;
    errorMessage: string;
    rawPayload: unknown;
    recordType: string;
    runId: string;
    sourceId: string;
  }
) {
  await database.failedRecord.create({
    data: {
      ...scoped(context),
      entity_type: "leave_records",
      error_code: input.errorCode,
      error_message: input.errorMessage,
      raw_payload: toPrismaJsonValue(input.rawPayload),
      record_type: failedRecordType(input.recordType),
      source_id: input.sourceId,
      source_remote_id: input.sourceId,
      sync_run_id: input.runId,
    },
  });
}

function failedRecordType(
  value: string
): z.infer<typeof FailedRecordTypeSchema> {
  const parsed = FailedRecordTypeSchema.safeParse(value);
  return parsed.success ? parsed.data : "leave_records";
}

async function completeRun(
  context: SyncXeroLeaveRecordsInput,
  runId: string,
  input: {
    counts: Counts;
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
      records_synced: input.counts.upserted + input.counts.archived,
      records_upserted: input.counts.upserted,
      status: input.status,
    },
    where: { ...scoped(context), id: runId },
  });
  publishRunStatusChanged(context, runId, input.status);
}

function loadXeroTenant(context: SyncXeroLeaveRecordsInput) {
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
      ...scoped(context),
      id: context.xeroTenantId,
      organisation_id: context.organisationId,
    },
  });
}

function connectionActive(connection: {
  access_token_encrypted: string;
  expires_at: Date;
  last_refreshed_at: Date | null;
  status?: string;
  revoked_at: Date | null;
}) {
  return (
    connection.status !== "stale" &&
    connection.status !== "disconnected" &&
    connection.revoked_at === null &&
    connection.access_token_encrypted.length > 0 &&
    connection.expires_at.getTime() > Date.now()
  );
}

function isBlanketFailure(error: XeroWriteError): boolean {
  return error.code === "auth_error" || error.code === "rate_limit_error";
}

function publishRunStatusChanged(
  context: SyncXeroLeaveRecordsInput,
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
        runType: "leave_records",
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

function emptyCounts(): Counts {
  return {
    archived: 0,
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
    ...emptyCounts(),
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
): Result<never, SyncXeroLeaveRecordsError> {
  return {
    ok: false,
    error: {
      code: "validation_error",
      message:
        error.issues[0]?.message ?? "Invalid sync leave records request.",
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
