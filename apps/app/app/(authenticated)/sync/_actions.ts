"use server";

import { auth, currentUser } from "@repo/auth/server";
import {
  cancelRun,
  exportFailedRecordsCsv,
  getRedactedFailedRecordPayload,
  listRunFailedRecords,
  listRunTimeline,
  type RunDetailPage,
  type SyncMonitorError,
  type SyncMonitorRole,
  type TimelinePage,
} from "@repo/availability";
import type { Result } from "@repo/core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getPublicApiUrl } from "@/lib/public-api-url";
import { getActiveOrgContext } from "@/lib/server/get-active-org-context";
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
  xeroTenantId: string;
}): Promise<Result<DispatchResultValue, SyncActionError>> {
  const parsed = DispatchManualSyncActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const context = await syncActionContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }
  return await dispatchManualSyncViaApi({
    organisationId: context.value.organisationId,
    runType: parsed.data.runType,
    xeroTenantId: parsed.data.xeroTenantId,
  });
}

async function dispatchManualSyncViaApi(input: {
  organisationId: string;
  runType: string;
  xeroTenantId: string;
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
  const parsed = CancelRunActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const context = await syncActionContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }
  const result = await cancelRun({
    ...context.value,
    runId: parsed.data.runId,
  });
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
  const parsed = ExportFailedRecordsCsvActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const context = await syncActionContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }
  return await exportFailedRecordsCsv({
    ...context.value,
    runId: parsed.data.runId,
  });
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
  const parsed = DetailPageActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const context = await syncActionContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }
  return await listRunFailedRecords({ ...context.value, ...parsed.data });
}

export async function loadTimelinePageAction(input: {
  cursor: string | null;
  organisationId: string;
  runId: string;
}): Promise<Result<TimelinePage, SyncActionError>> {
  const parsed = DetailPageActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const context = await syncActionContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }
  return await listRunTimeline({ ...context.value, ...parsed.data });
}

export async function loadRedactedFailurePayloadAction(input: {
  failureId: string;
  organisationId: string;
  runId: string;
}): Promise<Result<{ payload: unknown }, SyncActionError>> {
  const parsed = RawFailureActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const context = await syncActionContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }
  return await getRedactedFailedRecordPayload({
    ...context.value,
    failureId: parsed.data.failureId,
    runId: parsed.data.runId,
  });
}

async function syncActionContext(
  organisationId: string
): Promise<Result<SyncActionContext, SyncActionError>> {
  const [{ orgRole }, user, context] = await Promise.all([
    auth(),
    currentUser(),
    getActiveOrgContext(organisationId),
  ]);
  const role = effectiveRole(orgRole);
  if (!(user && role)) {
    return notAuthorised();
  }
  if (!context.ok) {
    return notAuthorised(context.error.message);
  }
  return {
    ok: true,
    value: {
      actingRole: role,
      actingUserId: user.id,
      clerkOrgId: context.value.clerkOrgId,
      organisationId: context.value.organisationId,
    },
  };
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
