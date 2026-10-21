import "server-only";
import { createActivationEvent } from "@repo/analytics/activation-events";
import { analytics } from "@repo/analytics/server";
import { withTenantDb } from "@repo/database";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";

export async function captureXeroConnected(input: {
  clerkOrgId: string;
  organisationId: string;
  connectionId: string;
}): Promise<void> {
  assertNoTenantTransaction("captureXeroConnected");
  try {
    const durableConnection = await withTenantDb(input.clerkOrgId, (db) =>
      db.xeroConnection.findFirst({
        select: { created_at: true },
        where: {
          clerk_org_id: input.clerkOrgId,
          id: input.connectionId,
          organisation_id: input.organisationId,
        },
      })
    );
    if (durableConnection) {
      const connectedEvent = createActivationEvent({
        deduplicationKey: `${input.clerkOrgId}:${input.organisationId}`,
        name: "Xero Connected",
        occurredAt: durableConnection.created_at,
        subjectId: input.clerkOrgId,
      });
      analytics?.capture({
        distinctId: connectedEvent.distinctId,
        event: connectedEvent.event,
        properties: connectedEvent.properties,
        timestamp: connectedEvent.timestamp,
        uuid: connectedEvent.uuid,
      });
      await analytics?.flush();
    }
  } catch {
    // The connection is durable; analytics must not turn it into a user-visible failure.
  }
}
