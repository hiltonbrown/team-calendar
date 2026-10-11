import "server-only";
import type { Result } from "@repo/core";
import { appError } from "@repo/core";
import { systemDatabase, tenantDatabase } from "@repo/database";
import { log } from "@repo/observability/log";
import { dispatchInitialXeroSync } from "../events";
export interface RecoverXeroImportDispatchOptions {
  now?: Date;
}
export interface RecoverXeroImportDispatchResult {
  dispatched: number;
  scanned: number;
  skipped: number;
}
export async function recoverXeroImportDispatch(
  _options: RecoverXeroImportDispatchOptions = {}
): Promise<Result<RecoverXeroImportDispatchResult>> {
  try {
    const tenants = await systemDatabase.xeroConnection.findMany({
      select: {
        clerk_org_id: true,
        id: true,
        initial_sync_requested_at: true,
        organisation_id: true,
      },
      where: {
        authorisation: { status: "active" },
        disconnected_at: null,
        initial_sync_completed_at: null,
        organisation: {
          archived_at: null,
          is_active: true,
        },
        payroll_region: "AU",
        status: "active",
        sync_paused_at: null,
      },
    });
    let dispatched = 0;
    let skipped = 0;
    for (const tenant of tenants) {
      const activeRun = await tenantDatabase(
        tenant.clerk_org_id
      ).syncRun.findFirst({
        where: {
          clerk_org_id: tenant.clerk_org_id,
          organisation_id: tenant.organisation_id,
          run_type: "people",
          status: "running",
          xero_connection_id: tenant.id,
        },
      });
      if (activeRun) {
        skipped += 1;
        continue;
      }
      const dispatchRes = await dispatchInitialXeroSync({
        clerkOrgId: tenant.clerk_org_id,
        connectionId: tenant.id,
        organisationId: tenant.organisation_id,
        ...(tenant.initial_sync_requested_at
          ? { requestedAt: tenant.initial_sync_requested_at.toISOString() }
          : {}),
        triggerType: "scheduled",
      });
      if (dispatchRes.ok) {
        dispatched += 1;
      } else {
        skipped += 1;
        log.error("Failed to recover initial Xero sync dispatch", {
          clerkOrgId: tenant.clerk_org_id,
          connectionId: tenant.id,
          error: dispatchRes.error,
          organisationId: tenant.organisation_id,
        });
      }
    }
    return {
      ok: true,
      value: {
        dispatched,
        scanned: tenants.length,
        skipped,
      },
    };
  } catch (error) {
    return {
      error: appError(
        "internal",
        `Failed to recover Xero import dispatch: ${error instanceof Error ? error.message : "Unknown error"}`
      ),
      ok: false,
    };
  }
}
