import "server-only";
import { createActivationEvent } from "@repo/analytics/activation-events";
import { analytics } from "@repo/analytics/server";
import { tenantDatabase } from "@repo/database";
import { log } from "@repo/observability/log";
export interface CaptureInitialSyncCompletedInput {
  clerkOrgId: string;
  connectionId?: string;
  organisationId: string;
}
export interface XeroImportReadiness {
  completedAt: Date | null;
  hasUnresolvedPeople: boolean;
  isInitialSyncCompleted: boolean;
  unresolvedPeopleCount: number;
}
function connectionWhere(input: CaptureInitialSyncCompletedInput) {
  return {
    clerk_org_id: input.clerkOrgId,
    organisation_id: input.organisationId,
    ...(input.connectionId ? { id: input.connectionId } : {}),
  };
}
export async function captureInitialSyncCompleted(
  input: CaptureInitialSyncCompletedInput
): Promise<void> {
  try {
    const connection = await tenantDatabase(
      input.clerkOrgId
    ).xeroConnection.findFirst({
      select: { initial_sync_completed_at: true },
      where: connectionWhere(input),
    });
    if (!connection?.initial_sync_completed_at) {
      return;
    }
    const event = createActivationEvent({
      deduplicationKey: `${input.clerkOrgId}:${input.organisationId}`,
      name: "Initial Sync Completed",
      occurredAt: connection.initial_sync_completed_at,
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
export async function checkXeroImportReadiness(
  input: CaptureInitialSyncCompletedInput
): Promise<XeroImportReadiness> {
  const [connection, unresolvedPeopleCount] = await Promise.all([
    tenantDatabase(input.clerkOrgId).xeroConnection.findFirst({
      select: { initial_sync_completed_at: true },
      where: connectionWhere(input),
    }),
    tenantDatabase(input.clerkOrgId).xeroPersonMatch.count({
      where: {
        clerk_org_id: input.clerkOrgId,
        organisation_id: input.organisationId,
        status: "pending",
      },
    }),
  ]);
  const completedAt = connection?.initial_sync_completed_at ?? null;
  return {
    completedAt,
    hasUnresolvedPeople: unresolvedPeopleCount > 0,
    isInitialSyncCompleted: completedAt !== null,
    unresolvedPeopleCount,
  };
}
