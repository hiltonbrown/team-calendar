"use server";

import { auth, currentUser } from "@repo/auth/server";
import {
  cancelRun,
  dispatchManualSync,
  exportFailedRecordsCsv,
  type SyncMonitorError,
  type SyncMonitorRole,
} from "@repo/availability";
import type { Result } from "@repo/core";
import { revalidatePath } from "next/cache";
import { requirePageRole } from "@/lib/auth/require-page-role";
import { getActiveOrgContext } from "@/lib/server/get-active-org-context";
import {
  CancelRunActionSchema,
  DispatchManualSyncActionSchema,
  ExportFailedRecordsCsvActionSchema,
} from "./_schemas";

type SyncActionError =
  | SyncMonitorError
  | { code: "not_authorised"; message: string }
  | { code: "validation_error"; message: string };

interface SyncActionContext {
  actingRole: SyncMonitorRole;
  actingUserId: string;
  clerkOrgId: string;
  organisationId: string;
}

export async function dispatchManualSyncAction(input: {
  organisationId: string;
  runType: string;
  xeroTenantId: string;
}): Promise<
  Result<
    { eventName: string; queued: boolean; reason?: string },
    SyncActionError
  >
> {
  const parsed = DispatchManualSyncActionSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message);
  }
  const context = await syncActionContext(parsed.data.organisationId);
  if (!context.ok) {
    return context;
  }
  const result = await dispatchManualSync({
    ...context.value,
    runType: parsed.data.runType,
    xeroTenantId: parsed.data.xeroTenantId,
  });
  if (result.ok) {
    revalidatePath("/sync");
    revalidatePath("/leave-approvals");
    revalidatePath("/notifications");
  }
  return result;
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

async function syncActionContext(
  organisationId: string
): Promise<Result<SyncActionContext, SyncActionError>> {
  await requirePageRole("org:admin");
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
    ok: false,
    error: {
      code: "not_authorised",
      message: message ?? "Only admins and owners can manage sync health.",
    },
  };
}

function validationError(message?: string): Result<never, SyncActionError> {
  return {
    ok: false,
    error: {
      code: "validation_error",
      message: message ?? "Invalid sync request.",
    },
  };
}
