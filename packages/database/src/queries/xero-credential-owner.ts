import { appError, type Result } from "@repo/core";
import type { XeroCredentialOwner } from "../../generated/client";
import { database } from "../client";

/** Credentials are system infrastructure; access is always resolved through a scoped binding. */
export async function findXeroCredentialOwnerForBinding(input: {
  clerkOrgId: string;
  organisationId: string;
}): Promise<Result<XeroCredentialOwner | null>> {
  try {
    const binding = await database.xeroTenant.findFirst({
      select: { credential_owner: true },
      where: {
        active_slot: 1,
        clerk_org_id: input.clerkOrgId,
        organisation_id: input.organisationId,
        xero_connection: {
          disconnected_at: null,
          revoked_at: null,
          status: { in: ["active", "stale"] },
        },
      },
    });
    return { ok: true, value: binding?.credential_owner ?? null };
  } catch {
    return {
      error: appError("internal", "Could not load Xero credentials"),
      ok: false,
    };
  }
}

/** System recovery enumeration returns routing IDs only, never recovery tokens. */
export async function listRecoverableXeroRefreshAttempts(input: {
  now: Date;
  limit?: number;
}): Promise<Result<{ attemptId: string; ownerId: string }[]>> {
  try {
    const attempts = await database.xeroRefreshAttempt.findMany({
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
      select: { id: true, xero_credential_owner_id: true },
      take: Math.min(Math.max(input.limit ?? 100, 1), 1000),
      where: {
        OR: [
          {
            created_at: { lt: new Date(input.now.getTime() - 120_000) },
            outcome: "pending",
          },
          { outcome: "lost_response" },
        ],
      },
    });
    return {
      ok: true,
      value: attempts.map((attempt) => ({
        attemptId: attempt.id,
        ownerId: attempt.xero_credential_owner_id,
      })),
    };
  } catch {
    return {
      error: appError(
        "internal",
        "Could not list Xero refresh recovery attempts"
      ),
      ok: false,
    };
  }
}
