import "server-only";

import { createActivationEvent } from "@repo/analytics/activation-events";
import { analytics } from "@repo/analytics/server";
import { database } from "@repo/database";
import type { sync_run_type } from "@repo/database/generated/enums";
import { log } from "@repo/observability/log";

const INITIAL_RUN_TYPES = [
  "people",
  "leave_records",
  "leave_balances",
] satisfies sync_run_type[];

export interface CaptureInitialSyncCompletedInput {
  bindingGeneration?: number;
  clerkOrgId: string;
  organisationId: string;
  xeroTenantId?: string;
}

export interface XeroImportReadiness {
  completedAt: Date | null;
  hasUnresolvedPeople: boolean;
  isInitialSyncCompleted: boolean;
  unresolvedPeopleCount: number;
}

export async function captureInitialSyncCompleted(
  input: CaptureInitialSyncCompletedInput
): Promise<void> {
  try {
    let tenant: {
      binding_generation: number;
      created_at: Date;
      id: string;
    } | null = null;

    if (database.xeroTenant?.findFirst) {
      tenant = await database.xeroTenant.findFirst({
        select: {
          binding_generation: true,
          created_at: true,
          id: true,
        },
        where: {
          clerk_org_id: input.clerkOrgId,
          organisation_id: input.organisationId,
          ...(input.xeroTenantId
            ? { id: input.xeroTenantId }
            : { active_slot: 1 }),
        },
      });

      if (
        input.bindingGeneration !== undefined &&
        tenant &&
        tenant.binding_generation !== input.bindingGeneration
      ) {
        log.warn("Skipping activation capture for changed binding generation", {
          currentGeneration: tenant.binding_generation,
          expectedGeneration: input.bindingGeneration,
          xeroTenantId: tenant.id,
        });
        return;
      }
    }

    const runs = await Promise.all(
      INITIAL_RUN_TYPES.map((runType) =>
        database.syncRun.findFirst({
          orderBy: { completed_at: "asc" },
          select: { completed_at: true },
          where: {
            clerk_org_id: input.clerkOrgId,
            completed_at: { not: null },
            organisation_id: input.organisationId,
            run_type: runType,
            status: "succeeded",
            ...tenantRunFilter(tenant, input.xeroTenantId),
          },
        })
      )
    );
    if (runs.some((run) => !run?.completed_at)) {
      return;
    }
    const occurredAt = new Date(
      Math.max(...runs.map((run) => run?.completed_at?.getTime() ?? 0))
    );
    const event = createActivationEvent({
      deduplicationKey: `${input.clerkOrgId}:${input.organisationId}`,
      name: "Initial Sync Completed",
      occurredAt,
      subjectId: input.clerkOrgId,
    });
    analytics?.capture({ ...event });
    await analytics?.flush();
  } catch (error) {
    log.warn("Initial sync activation capture failed", {
      clerkOrgId: input.clerkOrgId,
      error,
      organisationId: input.organisationId,
    });
  }
}

export async function checkXeroImportReadiness(input: {
  bindingGeneration?: number;
  clerkOrgId: string;
  organisationId: string;
  xeroTenantId?: string;
}): Promise<XeroImportReadiness> {
  let tenant: {
    binding_generation: number;
    created_at: Date;
    id: string;
  } | null = null;

  if (database.xeroTenant?.findFirst) {
    tenant = await database.xeroTenant.findFirst({
      select: {
        binding_generation: true,
        created_at: true,
        id: true,
      },
      where: {
        clerk_org_id: input.clerkOrgId,
        organisation_id: input.organisationId,
        ...(input.xeroTenantId
          ? { id: input.xeroTenantId }
          : { active_slot: 1 }),
      },
    });

    if (
      input.bindingGeneration !== undefined &&
      tenant &&
      tenant.binding_generation !== input.bindingGeneration
    ) {
      return {
        completedAt: null,
        hasUnresolvedPeople: false,
        isInitialSyncCompleted: false,
        unresolvedPeopleCount: 0,
      };
    }
  }

  const [runs, pendingMatchesCount] = await Promise.all([
    Promise.all(
      INITIAL_RUN_TYPES.map((runType) =>
        database.syncRun.findFirst({
          orderBy: { completed_at: "desc" },
          select: { completed_at: true },
          where: {
            clerk_org_id: input.clerkOrgId,
            completed_at: { not: null },
            organisation_id: input.organisationId,
            run_type: runType,
            status: "succeeded",
            ...tenantRunFilter(tenant, input.xeroTenantId),
          },
        })
      )
    ),
    database.xeroPersonMatch?.count
      ? database.xeroPersonMatch.count({
          where: {
            clerk_org_id: input.clerkOrgId,
            organisation_id: input.organisationId,
            status: "pending",
          },
        })
      : Promise.resolve(0),
  ]);

  const isInitialSyncCompleted = !runs.some((run) => !run?.completed_at);
  const completedAt = isInitialSyncCompleted
    ? new Date(
        Math.max(...runs.map((run) => run?.completed_at?.getTime() ?? 0))
      )
    : null;

  return {
    completedAt,
    hasUnresolvedPeople: pendingMatchesCount > 0,
    isInitialSyncCompleted,
    unresolvedPeopleCount: pendingMatchesCount,
  };
}

function tenantRunFilter(
  tenant: { created_at: Date; id: string } | null,
  xeroTenantId: string | null | undefined
) {
  if (tenant) {
    return {
      started_at: { gte: tenant.created_at },
      xero_tenant_id: tenant.id,
    };
  }
  if (xeroTenantId) {
    return { xero_tenant_id: xeroTenantId };
  }
  return {};
}
