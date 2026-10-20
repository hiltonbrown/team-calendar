"use server";

import { requireRole } from "@repo/auth/helpers";
import { auth, currentUser } from "@repo/auth/server";
import {
  exportFailedRecordsCsv,
  getRedactedFailedRecordPayload,
  listRunFailedRecords,
  listRunTimeline,
  prepareSyncCancellation,
  type RunDetailPage,
  recordSyncCancellation,
  type SyncMonitorError,
  type SyncMonitorRole,
  sendPreparedSyncCancellation,
  type TimelinePage,
} from "@repo/availability";
import type { Result } from "@repo/core";
import { type TenantDb, withTenantResult } from "@repo/database";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getPublicApiUrl } from "@/lib/public-api-url";
import {
  CancelRunActionSchema,
  DispatchManualSyncActionSchema,
  ExportFailedRecordsCsvActionSchema,
} from "./_schemas";

type SyncActionError =
  | SyncMonitorError
  | { code: "not_authorised"; message: string }
  | { code: "validation_error"; message: string }
  | { code: "sync_failed"; message: string };

interface SyncActionContext {
  actingRole: SyncMonitorRole;
  actingUserId: string;
  clerkOrgId: string;
  organisationId: string;
}

interface DispatchResultValue {
  errorSummary?: string | null;
  eventName: string;
  failed?: number;
  fetched?: number;
  queued: boolean;
  reason?: string;
  runId?: string;
  skipped?: number;
  status?: string;
  upserted?: number;
}

const DispatchApiResponseSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    value: z.object({
      errorSummary: z.string().nullable().optional(),
      eventName: z.string(),
      failed: z.number().int().nonnegative().optional(),
      fetched: z.number().int().nonnegative().optional(),
      queued: z.boolean(),
      reason: z.string().optional(),
      runId: z.string().optional(),
      skipped: z.number().int().nonnegative().optional(),
      status: z.string().optional(),
      upserted: z.number().int().nonnegative().optional(),
    }),
  }),
  z.object({
    error: z.object({
      code: z.enum([
        "connection_not_active",
        "dispatch_failed",
        "invalid_run_type",
        "not_authorised",
        "run_not_found",
        "sync_failed",
        "tenant_not_found",
        "tenant_sync_paused",
        "unknown_error",
        "validation_error",
      ]),
      message: z.string(),
    }),
    ok: z.literal(false),
  }),
]);

export async function dispatchManualSyncAction(input: {
  organisationId: string;
  runType: string;
  connectionId: string;
}): Promise<Result<DispatchResultValue, SyncActionError>> {
  assertNoTenantTransaction("dispatchManualSyncAction");
  const [admin, owner] = await Promise.all([
    requireRole("org:admin"),
    requireRole("org:owner"),
  ]);
  if (!(admin || owner)) {
    return notAuthorised();
  }
  const parsed = DispatchManualSyncActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const context = await syncActionContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }
  return await dispatchManualSyncViaApi({
    connectionId: parsed.data.connectionId,
    organisationId: context.value.organisationId,
    runType: parsed.data.runType,
  });
}

async function dispatchManualSyncViaApi(input: {
  organisationId: string;
  runType: string;
  connectionId: string;
}): Promise<Result<DispatchResultValue, SyncActionError>> {
  const apiUrl = getPublicApiUrl("/api/sync/dispatch");
  if (!apiUrl) {
    return dispatchFailed("The API URL is not configured for sync dispatch.");
  }

  let sessionToken: string | null;
  try {
    const authObject = await auth();
    sessionToken = await authObject.getToken();
  } catch {
    return dispatchFailed("Could not authorise the sync dispatch request.");
  }
  if (!sessionToken) {
    return notAuthorised();
  }

  try {
    const response = await fetch(apiUrl, {
      body: JSON.stringify(input),
      cache: "no-store",
      headers: {
        authorization: `Bearer ${sessionToken}`,
        "content-type": "application/json",
      },
      method: "POST",
    });
    const responseBody: unknown = await response.json().catch(() => null);
    const parsed = DispatchApiResponseSchema.safeParse(responseBody);
    if (!parsed.success) {
      return dispatchFailed(
        "The sync dispatch service returned an invalid response."
      );
    }
    return parsed.data;
  } catch {
    return dispatchFailed("Failed to reach the sync dispatch service.");
  }
}

function dispatchFailed(message: string): Result<never, SyncActionError> {
  return {
    error: { code: "dispatch_failed", message },
    ok: false,
  };
}

export async function cancelRunAction(input: {
  organisationId: string;
  runId: string;
}): Promise<
  Result<{ cancellationRequested: true; eventQueued: boolean }, SyncActionError>
> {
  assertNoTenantTransaction("cancelRunAction");
  const [admin, owner] = await Promise.all([
    requireRole("org:admin"),
    requireRole("org:owner"),
  ]);
  if (!(admin || owner)) {
    return notAuthorised();
  }
  const parsed = CancelRunActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  let result: Awaited<ReturnType<typeof sendPreparedSyncCancellation>>;
  try {
    const prepared = await runSyncOperation(
      parsed.data.organisationId,
      (context, db) =>
        prepareSyncCancellation({ ...context, runId: parsed.data.runId }, db)
    );
    if (!prepared.ok) {
      return prepared;
    }
    const sent = await sendPreparedSyncCancellation(prepared.value);
    result = sent;
    if (sent.ok) {
      const { value: cancellation } = prepared;
      const { eventQueued } = sent.value;
      const audited = await withTenantResult(cancellation.clerkOrgId, (db) =>
        recordSyncCancellation(cancellation, eventQueued, db)
      );
      if (!audited.ok) {
        result = audited;
      }
    }
  } catch {
    return {
      error: {
        code: "unknown_error",
        message: "Failed to request sync cancellation.",
      },
      ok: false,
    };
  }
  if (result.ok) {
    revalidatePath("/sync");
    revalidatePath(`/sync/${parsed.data.runId}`);
  }
  return result;
}

export async function exportFailedRecordsCsvAction(input: {
  organisationId: string;
  runId: string;
}): Promise<Result<{ csvContent: string; filename: string }, SyncActionError>> {
  assertNoTenantTransaction("exportFailedRecordsCsvAction");
  const parsed = ExportFailedRecordsCsvActionSchema.safeParse(input);
  if (!parsed.success) {
    return await validationError(parsed.error.issues[0]?.message);
  }
  return await runSyncOperation(
    parsed.data.organisationId,
    async (context, db) =>
      await exportFailedRecordsCsv(
        {
          ...context,
          runId: parsed.data.runId,
        },
        db
      )
  );
}

const DetailPageActionSchema = z.object({
  cursor: z.string().min(1).nullable(),
  organisationId: z.string().uuid(),
  runId: z.string().uuid(),
});

const RawFailureActionSchema = z.object({
  failureId: z.string().uuid(),
  organisationId: z.string().uuid(),
  runId: z.string().uuid(),
});

export async function loadFailedRecordsPageAction(input: {
  cursor: string | null;
  organisationId: string;
  runId: string;
}): Promise<Result<RunDetailPage, SyncActionError>> {
  assertNoTenantTransaction("loadFailedRecordsPageAction");
  const parsed = DetailPageActionSchema.safeParse(input);
  if (!parsed.success) {
    return await validationError(parsed.error.issues[0]?.message);
  }
  return await runSyncOperation(
    parsed.data.organisationId,
    async (context, db) =>
      await listRunFailedRecords({ ...context, ...parsed.data }, db)
  );
}

export async function loadTimelinePageAction(input: {
  cursor: string | null;
  organisationId: string;
  runId: string;
}): Promise<Result<TimelinePage, SyncActionError>> {
  assertNoTenantTransaction("loadTimelinePageAction");
  const parsed = DetailPageActionSchema.safeParse(input);
  if (!parsed.success) {
    return await validationError(parsed.error.issues[0]?.message);
  }
  return await runSyncOperation(
    parsed.data.organisationId,
    async (context, db) =>
      await listRunTimeline({ ...context, ...parsed.data }, db)
  );
}

export async function loadRedactedFailurePayloadAction(input: {
  failureId: string;
  organisationId: string;
  runId: string;
}): Promise<Result<{ payload: unknown }, SyncActionError>> {
  assertNoTenantTransaction("loadRedactedFailurePayloadAction");
  const parsed = RawFailureActionSchema.safeParse(input);
  if (!parsed.success) {
    return await validationError(parsed.error.issues[0]?.message);
  }
  return await runSyncOperation(
    parsed.data.organisationId,
    async (context, db) =>
      await getRedactedFailedRecordPayload(
        {
          ...context,
          failureId: parsed.data.failureId,
          runId: parsed.data.runId,
        },
        db
      )
  );
}

async function syncActionIdentity(
  organisationId: string
): Promise<Result<SyncActionContext, SyncActionError>> {
  const [{ orgId, orgRole }, user] = await Promise.all([auth(), currentUser()]);
  const role = effectiveRole(orgRole);
  if (!(orgId && user && role)) {
    return notAuthorised();
  }
  return {
    ok: true,
    value: {
      actingRole: role,
      actingUserId: user.id,
      clerkOrgId: orgId,
      organisationId,
    },
  };
}

async function runSyncOperation<T>(
  organisationId: string,
  operation: (
    context: SyncActionContext,
    db: TenantDb
  ) => Promise<Result<T, SyncActionError>>
): Promise<Result<T, SyncActionError>> {
  const identity = await syncActionIdentity(organisationId);
  if (!identity.ok) {
    return identity;
  }
  const { value: context } = identity;
  return withTenantResult(context.clerkOrgId, async (db) => {
    const company = await db.organisation.findFirst({
      select: { id: true },
      where: { clerk_org_id: context.clerkOrgId, id: organisationId },
    });
    if (!company) {
      return notAuthorised(
        "Organisation not found or not accessible in your context"
      );
    }
    return operation(context, db);
  });
}

async function syncActionContext(
  organisationId: string
): Promise<Result<SyncActionContext, SyncActionError>> {
  return await runSyncOperation(organisationId, async (context) => ({
    ok: true,
    value: context,
  }));
}

function effectiveRole(
  role: string | null | undefined
): SyncMonitorRole | null {
  if (role === "org:owner") {
    return "owner";
  }
  if (role === "org:admin") {
    return "admin";
  }
  return null;
}

function notAuthorised(message?: string): Result<never, SyncActionError> {
  return {
    error: {
      code: "not_authorised",
      message: message ?? "Only admins and owners can manage sync health.",
    },
    ok: false,
  };
}

function validationError(message?: string): Result<never, SyncActionError> {
  return {
    error: {
      code: "validation_error",
      message: message ?? "Invalid sync request.",
    },
    ok: false,
  };
}
