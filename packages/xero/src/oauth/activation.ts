import "server-only";
import { createActivationEvent } from "@repo/analytics/activation-events";
import { analytics } from "@repo/analytics/server";
import { tenantDatabase } from "@repo/database";

export async function captureXeroConnected(input: {
  clerkOrgId: string;
  organisationId: string;
  connectionId: string;
}): Promise<void> {
  try {
    const durableConnection = await tenantDatabase(
      input.clerkOrgId
    ).xeroConnection.findFirst({
      select: { created_at: true },
      where: {
        clerk_org_id: input.clerkOrgId,
        id: input.connectionId,
        organisation_id: input.organisationId,
      },
    });
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
