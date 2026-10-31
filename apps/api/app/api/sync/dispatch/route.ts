import {
  getCurrentUser,
  hasPermission,
  requireAccount,
} from "@repo/auth/helpers";
import {
  prepareManualSync,
  recordManualSyncDispatch,
  type SyncMonitorError,
  type SyncMonitorRole,
  sendPreparedManualSync,
} from "@repo/availability";
import { withTenantDb } from "@repo/database";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  executeLocalSyncFallback,
  type LocalSyncFallbackError,
} from "../../../../lib/sync/execute-local-sync-fallback";

const DispatchSyncRequestSchema = z.object({
  connectionId: z.string().uuid(),
  organisationId: z.string().uuid(),
  runType: z.enum([
    "people",
    "leave_records",
    "leave_balances",
    "approval_state_reconciliation",
  ]),
});

export async function POST(request: Request): Promise<Response> {
  let accountId: string;
  try {
    accountId = await requireAccount();
  } catch {
    return NextResponse.json(notAuthorised(), { status: 401 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(notAuthorised(), { status: 401 });
  }

  let role: SyncMonitorRole | null = null;
  try {
    const [isAdmin, isOwner] = await Promise.all([
      hasPermission({ xero: ["sync"] }),
      hasPermission({ ownership: ["manage"] }),
    ]);
    if (isOwner) {
      role = "owner";
    } else if (isAdmin) {
      role = "admin";
    }
  } catch {
    return NextResponse.json(notAuthorised(), { status: 401 });
  }
  if (!role) {
    return NextResponse.json(notAuthorised(), { status: 403 });
  }

  const payload: unknown = await request.json().catch(() => null);
  const parsed = DispatchSyncRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: parsed.error.issues[0]?.message ?? "Invalid sync request.",
        },
        ok: false,
      },
      { status: 400 }
    );
  }

  const syncInput = {
    accountId,
    actingRole: role,
    actingUserId: user.id,
    connectionId: parsed.data.connectionId,
    organisationId: parsed.data.organisationId,
    runType: parsed.data.runType,
  };
  let result: Awaited<ReturnType<typeof sendPreparedManualSync>>;
  try {
    const prepared = await withTenantDb(accountId, (db) =>
      prepareManualSync(syncInput, db)
    );
    const sent = prepared.ok
      ? await sendPreparedManualSync(prepared.value)
      : prepared;
    result = sent;
    if (sent.ok && sent.value.queued) {
      const audited = await withTenantDb(accountId, (db) =>
        recordManualSyncDispatch(syncInput, db)
      );
      if (!audited.ok) {
        result = audited;
      }
    }
  } catch {
    result = {
      error: {
        code: "unknown_error",
        message: "Failed to dispatch the manual sync.",
      },
      ok: false,
    };
  }

  if (
    !result.ok &&
    result.error.code === "dispatch_failed" &&
    process.env.NODE_ENV !== "production"
  ) {
    const fallbackResult = await executeLocalSyncFallback(syncInput);
    return NextResponse.json(fallbackResult, {
      status: fallbackResult.ok ? 200 : errorStatus(fallbackResult.error),
    });
  }

  return NextResponse.json(result, {
    status: result.ok ? 202 : errorStatus(result.error),
  });
}

type SyncDispatchError = SyncMonitorError | LocalSyncFallbackError;

function errorStatus(error: SyncDispatchError): number {
  switch (error.code) {
    case "validation_error":
    case "invalid_run_type":
      return 400;
    case "not_authorised":
      return 403;
    case "run_not_found":
    case "tenant_not_found":
      return 404;
    case "connection_not_active":
    case "tenant_sync_paused":
      return 409;
    case "dispatch_failed":
      return 503;
    case "sync_failed":
    case "unknown_error":
      return 500;
    default: {
      const exhaustive: never = error;
      return exhaustive;
    }
  }
}

function notAuthorised(): {
  error: { code: "not_authorised"; message: string };
  ok: false;
} {
  return {
    error: {
      code: "not_authorised",
      message: "Only admins and owners can manage sync health.",
    },
    ok: false,
  };
}
