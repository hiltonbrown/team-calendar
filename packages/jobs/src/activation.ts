import "server-only";
import { createActivationEvent } from "@repo/analytics/activation-events";
import { analytics } from "@repo/analytics/server";
import { assertTenantDb, type TenantDb, withTenantDb } from "@repo/database";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import { log } from "@repo/observability/log";
export interface CaptureInitialSyncCompletedInput {
  accountId: string;
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
    account_id: input.accountId,
    organisation_id: input.organisationId,
    ...(input.connectionId ? { id: input.connectionId } : {}),
  };
}
export async function captureInitialSyncCompleted(
  input: CaptureInitialSyncCompletedInput
): Promise<void> {
  assertNoTenantTransaction("captureInitialSyncCompleted");
  try {
    const connection = await withTenantDb(input.accountId, (db) =>
      db.xeroConnection.findFirst({
        select: { initial_sync_completed_at: true },
        where: connectionWhere(input),
      })
    );
    if (!connection?.initial_sync_completed_at) {
      return;
    }
    const event = createActivationEvent({
      deduplicationKey: `${input.accountId}:${input.organisationId}`,
      name: "Initial Sync Completed",
      occurredAt: connection.initial_sync_completed_at,
      subjectId: input.accountId,
    });
    analytics?.capture({ ...event });
    await analytics?.flush();
  } catch (error) {
    log.warn("Initial sync activation capture failed", {
      accountId: input.accountId,
      error,
      organisationId: input.organisationId,
    });
  }
}
export async function checkXeroImportReadiness(
  input: CaptureInitialSyncCompletedInput,
  db: TenantDb
): Promise<XeroImportReadiness> {
  assertTenantDb(db, input.accountId);
  {
    assertTenantDb(db, input.accountId);
    const client = db;

    const [connection, unresolvedPeopleCount] = [
      await client.xeroConnection.findFirst({
        select: { initial_sync_completed_at: true },
        where: connectionWhere(input),
      }),
      await client.xeroPersonMatch.count({
        where: {
          account_id: input.accountId,
          organisation_id: input.organisationId,
          status: "pending",
        },
      }),
    ];
    const completedAt = connection?.initial_sync_completed_at ?? null;
    return {
      completedAt,
      hasUnresolvedPeople: unresolvedPeopleCount > 0,
      isInitialSyncCompleted: completedAt !== null,
      unresolvedPeopleCount,
    };
  }
}
