import { currentUser, requireOrg, requireRole } from "@repo/auth/helpers";
import {
  dispatchManualSync,
  type SyncMonitorError,
  type SyncMonitorRole,
} from "@repo/availability";
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
  let clerkOrgId: string;
  try {
    clerkOrgId = await requireOrg();
  } catch {
    return NextResponse.json(notAuthorised(), { status: 401 });
  }

  const user = await currentUser();
  if (!user) {
    return NextResponse.json(notAuthorised(), { status: 401 });
  }

  let role: SyncMonitorRole | null = null;
  try {
    const [isAdmin, isOwner] = await Promise.all([
      requireRole("org:admin"),
      requireRole("org:owner"),
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
    actingRole: role,
    actingUserId: user.id,
    clerkOrgId,
    connectionId: parsed.data.connectionId,
    organisationId: parsed.data.organisationId,
    runType: parsed.data.runType,
  };
  const result = await dispatchManualSync(syncInput);

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
