import "server-only";

import type { Result } from "@repo/core";
import { appError } from "@repo/core";
import { database } from "@repo/database";
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
    const tenants = await database.xeroTenant.findMany({
      select: {
        binding_generation: true,
        clerk_org_id: true,
        id: true,
        organisation_id: true,
      },
      where: {
        active_slot: 1,
        last_people_sync_at: null,
        organisation: {
          archived_at: null,
          is_active: true,
        },
        payroll_region: "AU",
        sync_paused_at: null,
        xero_connection: {
          disconnected_at: null,
          revoked_at: null,
          status: "active",
        },
      },
    });

    let dispatched = 0;
    let skipped = 0;

    for (const tenant of tenants) {
      const activeRun = await database.syncRun.findFirst({
        where: {
          clerk_org_id: tenant.clerk_org_id,
          organisation_id: tenant.organisation_id,
          run_type: "people",
          status: "running",
          xero_tenant_id: tenant.id,
        },
      });
      if (activeRun) {
        skipped += 1;
        continue;
      }

      const dispatchRes = await dispatchInitialXeroSync({
        bindingGeneration: tenant.binding_generation,
        clerkOrgId: tenant.clerk_org_id,
        organisationId: tenant.organisation_id,
        triggerType: "scheduled",
        xeroTenantId: tenant.id,
      });

      if (dispatchRes.ok) {
        dispatched += 1;
      } else {
        skipped += 1;
        log.error("Failed to recover initial Xero sync dispatch", {
          clerkOrgId: tenant.clerk_org_id,
          error: dispatchRes.error,
          organisationId: tenant.organisation_id,
          xeroTenantId: tenant.id,
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
