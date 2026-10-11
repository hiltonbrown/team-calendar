import "server-only";
import { XERO_WRITE_CLAIM_LEASE_MS } from "@repo/availability";
import type { Result } from "@repo/core";
import {
  lockScopedXeroConnection,
  type Prisma,
  tenantDatabase,
  tenantTransaction,
  withXeroGrantLock,
} from "@repo/database";
import { getScopedXeroConnection } from "@repo/database/queries/xero-connections";
import {
  ALL_PRIVACY_MODES,
  invalidateAccountFeedCaches,
  invalidateFeedCache,
} from "@repo/feeds";
import { xeroFetch } from "../rate-limit/xero-fetch";
import { authorisationAccessToken, resolveXeroAccess } from "./authorisation";

export interface XeroDisconnectResult {
  connectionId: string;
  state: "disconnected";
}
interface DisconnectError {
  code: string;
  message: string;
}
const failure = (
  code = "unknown_error",
  message = "Xero could not be disconnected. Try again."
): { ok: false; error: DisconnectError } => ({
  error: { code, message },
  ok: false,
});

export async function disconnectXeroOAuthConnection(input: {
  clerkOrgId: string;
  organisationId: string;
  connectionId: string;
  destructive: boolean;
  removeCompany?: boolean;
  role?: string;
  performedByUserId?: string | null;
}): Promise<Result<XeroDisconnectResult, DisconnectError>> {
  if (input.removeCompany && input.role !== "owner") {
    return failure("forbidden", "Only an account owner can remove a company.");
  }
  try {
    if (input.removeCompany) {
      const previous = await tenantDatabase(
        input.clerkOrgId
      ).xeroConnection.findFirst({
        select: {
          disconnected_at: true,
          id: true,
          released_at: true,
          remote_connection_id: true,
          status: true,
          xero_authorisation_id: true,
        },
        where: {
          clerk_org_id: input.clerkOrgId,
          id: input.connectionId,
          organisation_id: input.organisationId,
        },
      });
      if (
        previous?.status === "disconnected" &&
        previous.disconnected_at &&
        !previous.remote_connection_id &&
        !previous.xero_authorisation_id &&
        !previous.released_at
      ) {
        return removePreviouslyDisconnectedCompany(input);
      }
      if (previous?.released_at) {
        return {
          ok: true,
          value: { connectionId: previous.id, state: "disconnected" },
        };
      }
      const current = await getScopedXeroConnection(input);
      if (
        current.ok &&
        current.value.status !== "disconnected" &&
        !canReachXero(current.value)
      ) {
        return removeUnreachableCompany(input);
      }
    }
    const initial = await getScopedXeroConnection(input);
    if (
      !(
        initial.ok &&
        initial.value.authorisation &&
        initial.value.remote_connection_id
      )
    ) {
      return failure(
        "connection_inactive",
        "Reconnect Xero before disconnecting."
      );
    }
    const access = await resolveXeroAccess({
      ...input,
      capability: [],
      deadline: { expiresAtMs: Date.now() + 10_000 },
    });
    if (!access.ok) {
      return access;
    }
    const grant = initial.value.authorisation;
    const result = await withXeroGrantLock(
      {
        deadlineAt: Date.now() + 15_000,
        mode: "refresh",
        providerAppId: grant.provider_app_id,
        xeroUserId: grant.xero_user_id,
      },
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Remote certainty, grant lifetime and atomic archival must share the existing grant-locked transaction.
      async (tx) => {
        await lockScopedXeroConnection(tx, input);
        const scoped = await getScopedXeroConnection(input, tx);
        if (
          !(scoped.ok && scoped.value.authorisation) ||
          scoped.value.status !== "active" ||
          scoped.value.xero_authorisation_id !== grant.id ||
          scoped.value.remote_connection_id !==
            initial.value.remote_connection_id ||
          scoped.value.xero_tenant_id !== initial.value.xero_tenant_id ||
          scoped.value.payroll_region !== initial.value.payroll_region ||
          scoped.value.last_connected_at?.getTime() !==
            initial.value.last_connected_at?.getTime() ||
          scoped.value.authorisation.status !== "active"
        ) {
          return failure(
            "connection_changed",
            "The Xero connection changed. Try again."
          );
        }
        const connection = scoped.value;
        const scope = {
          clerk_org_id: input.clerkOrgId,
          organisation_id: input.organisationId,
        };
        const busy = await tx.availabilityRecord.findFirst({
          select: { id: true },
          where: {
            ...scope,
            OR: [
              {
                approval_status: "xero_sync_failed",
                failed_action: { in: ["approve", "decline", "withdraw"] },
                source_remote_id: { not: null },
                source_type: {
                  in: ["xero", "xero_leave", "team_calendar_leave"],
                },
                xero_write_error_raw: {
                  equals: "outcome_unknown",
                  path: ["certainty"],
                },
              },
              {
                xero_write_claimed_at: {
                  gte: new Date(Date.now() - XERO_WRITE_CLAIM_LEASE_MS),
                },
              },
              {
                outbound_operations: {
                  some: {
                    status: {
                      in: ["prepared", "outcome_unknown", "provider_accepted"],
                    },
                  },
                },
              },
            ],
          },
        });
        if (busy) {
          return failure(
            "write_in_progress",
            "Finish or resolve the current Xero payroll write before disconnecting."
          );
        }
        // Delete this Organisation's remote link; revoking a shared grant would
        // also disconnect sibling Organisations. Unknown outcomes retain local state.
        const response = await xeroFetch({
          deadline: { expiresAtMs: Date.now() + 10_000 },
          init: {
            headers: {
              Authorization: `Bearer ${authorisationAccessToken(scoped.value.authorisation)}`,
            },
            method: "DELETE",
          },
          rateClass: {
            kind: "user_inventory",
            providerAppId: grant.provider_app_id,
          },
          url: `https://api.xero.com/connections/${encodeURIComponent(connection.remote_connection_id ?? "")}`,
        });
        if (response.status !== 204 && response.status !== 404) {
          return failure();
        }
        const now = new Date();
        await tx.xeroSyncCursor.deleteMany({
          where: { ...scope, xero_connection_id: connection.id },
        });
        await tx.xeroConnection.updateMany({
          data: {
            balance_next_person_id: null,
            disconnected_at: now,
            disconnected_by_user_id: input.performedByUserId,
            initial_sync_completed_at: null,
            initial_sync_requested_at: null,
            last_disconnected_at: now,
            leave_next_person_id: null,
            remote_connection_id: null,
            status: "disconnected",
            ...(input.removeCompany ? { released_at: now } : {}),
            sync_paused_at: now,
            xero_authorisation_id: null,
          },
          where: { ...scope, id: connection.id },
        });
        const feeds =
          input.destructive || input.removeCompany
            ? await tx.feed.findMany({
                select: { id: true },
                where: {
                  clerk_org_id: input.clerkOrgId,
                  OR: [
                    { organisation_id: input.organisationId },
                    { organisation_id: null },
                  ],
                },
              })
            : [];
        if (input.removeCompany) {
          await archiveCompanyState(tx, input, now);
        }
        if (input.destructive && !input.removeCompany) {
          await tx.syncRun.deleteMany({
            where: { ...scope, xero_connection_id: connection.id },
          });
          await tx.leaveBalance.deleteMany({
            where: { ...scope, xero_connection_id: connection.id },
          });
          await tx.xeroPersonMatch.deleteMany({ where: scope });
          await tx.person.updateMany({
            data: {
              source_person_key: null,
              source_system: "MANUAL",
              xero_employee_id: null,
            },
            where: {
              ...scope,
              OR: [
                {
                  availability_records: {
                    some: {
                      ...scope,
                      source_type: { in: ["manual", "team_calendar_leave"] },
                    },
                  },
                },
                {
                  leave_balances: {
                    some: { ...scope, xero_connection_id: null },
                  },
                },
              ],
              source_system: "XERO",
            },
          });
          await tx.person.updateMany({
            data: {
              archived_at: now,
              clerk_user_id: null,
              xero_employee_id: null,
            },
            where: { ...scope, source_system: "XERO" },
          });
          await tx.availabilityRecord.updateMany({
            data: {
              archived_at: now,
              derived_sequence: { increment: 1 },
              publish_status: "archived",
            },
            where: {
              ...scope,
              archived_at: null,
              source_type: { in: ["xero", "xero_leave"] },
            },
          });
        }
        let auditAction = input.destructive
          ? "xero.connection_disconnected_destructive"
          : "xero.connection_disconnected_soft";
        if (input.removeCompany) {
          auditAction = "company_removed";
        }
        await tx.auditEvent.create({
          data: {
            ...scope,
            action: auditAction,
            actor_user_id: input.performedByUserId,
            entity_id: connection.id,
            entity_type: "xero_connection",
            metadata: {
              mode: input.destructive ? "destructive" : "soft",
              state: "disconnected",
            },
            resource_id: connection.id,
            resource_type: "xero_connection",
          },
        });
        await tx.xeroOAuthSession.updateMany({
          data: { xero_authorisation_id: null },
          where: {
            OR: [
              { status: { not: "selecting" } },
              { expires_at: { lte: now } },
            ],
            xero_authorisation_id: grant.id,
          },
        });
        // The grant lock prevents adoption from racing this fresh reference check.
        await tx.xeroAuthorisation.deleteMany({
          where: {
            connections: { none: {} },
            id: grant.id,
            sessions: {
              none: { expires_at: { gt: now }, status: "selecting" },
            },
          },
        });
        return {
          feeds,
          ok: true as const,
          value: {
            connectionId: connection.id,
            state: "disconnected" as const,
          },
        };
      }
    );
    if (result.ok) {
      await Promise.allSettled(
        result.feeds.map((feed) =>
          invalidateFeedCache({
            feedId: feed.id,
            privacyModes: [...ALL_PRIVACY_MODES],
          })
        )
      );
      if (input.removeCompany) {
        await invalidateAccountFeedCaches({ clerkOrgId: input.clerkOrgId });
      }
      return { ok: true, value: result.value };
    }
    return result;
  } catch {
    return failure();
  }
}

export async function removeXeroCompany(input: {
  clerkOrgId: string;
  organisationId: string;
  connectionId: string;
  performedByUserId?: string | null;
  role: "owner" | "admin" | "manager" | "viewer";
}): Promise<
  Result<
    { connectionId: string; organisationId: string; state: "removed" },
    DisconnectError
  >
> {
  const result = await disconnectXeroOAuthConnection({
    ...input,
    destructive: false,
    removeCompany: true,
  });
  return result.ok
    ? {
        ok: true,
        value: {
          connectionId: result.value.connectionId,
          organisationId: input.organisationId,
          state: "removed",
        },
      }
    : result;
}
export async function disconnectAllXeroConnections(input: {
  clerkOrgId: string;
  performedByUserId?: string | null;
  destructive?: boolean;
}) {
  const connections = await tenantDatabase(
    input.clerkOrgId
  ).xeroConnection.findMany({
    select: { id: true, organisation_id: true },
    where: {
      clerk_org_id: input.clerkOrgId,
      released_at: null,
      status: "active",
    },
  });
  const outcomes: ({ connectionId: string; organisationId: string } & Result<
    XeroDisconnectResult,
    DisconnectError
  >)[] = [];
  for (const connection of connections) {
    const result = await disconnectXeroOAuthConnection({
      ...input,
      connectionId: connection.id,
      destructive: input.destructive ?? false,
      organisationId: connection.organisation_id,
    });
    outcomes.push({
      connectionId: connection.id,
      organisationId: connection.organisation_id,
      ...result,
    });
  }
  return { ok: true as const, value: { outcomes } };
}

async function archiveCompanyState(
  tx: Prisma.TransactionClient,
  input: { clerkOrgId: string; organisationId: string },
  now: Date
): Promise<void> {
  const scope = {
    clerk_org_id: input.clerkOrgId,
    organisation_id: input.organisationId,
  };
  await tx.organisation.updateMany({
    data: { archived_at: now, is_active: false },
    where: {
      archived_at: null,
      clerk_org_id: input.clerkOrgId,
      id: input.organisationId,
    },
  });
  await tx.person.updateMany({
    data: { archived_at: now, is_active: false },
    where: { ...scope, archived_at: null, source_system: "XERO" },
  });
  await tx.availabilityRecord.updateMany({
    data: {
      archived_at: now,
      derived_sequence: { increment: 1 },
      publish_status: "archived",
    },
    where: {
      ...scope,
      archived_at: null,
      source_type: {
        in: ["xero", "xero_leave", "team_calendar_leave"],
      },
    },
  });
  await tx.feed.updateMany({
    data: { archived_at: now, status: "archived" },
    where: scope,
  });
  await tx.feedToken.updateMany({
    data: { revoked_at: now, status: "revoked" },
    where: {
      clerk_org_id: input.clerkOrgId,
      feed: {
        clerk_org_id: input.clerkOrgId,
        organisation_id: input.organisationId,
      },
      revoked_at: null,
    },
  });
  await tx.availabilityPublication.deleteMany({ where: scope });
  // A subquery keeps the statement bounded for companies with many records.
  await tx.$executeRaw`
    UPDATE feed_event_publications
    SET present = false, updated_at = ${now}
    WHERE clerk_org_id = ${input.clerkOrgId}
      AND (
        organisation_id = ${input.organisationId}::uuid
        OR starts_with(source_key, ${`holiday:${input.organisationId}:`})
        OR source_key IN (
          SELECT 'availability:' || record.id::text
          FROM availability_records record
          WHERE record.clerk_org_id = ${input.clerkOrgId}
            AND record.organisation_id = ${input.organisationId}::uuid
        )
      )`;
  await tx.feed.updateMany({
    data: {
      last_etag: null,
      last_rendered_at: null,
      representation_generation: { increment: 1 },
    },
    where: {
      clerk_org_id: input.clerkOrgId,
      OR: [
        { organisation_id: input.organisationId },
        { organisation_id: null },
      ],
    },
  });
}
function canReachXero(connection: {
  authorisation: { status: string } | null;
  status: string;
}): boolean {
  return (
    connection.status === "active" &&
    connection.authorisation?.status === "active"
  );
}

// The grant or connection can no longer reach Xero, so no remote DELETE is
// possible. The owner's confirmation releases the company locally and the audit
// event records that remote deletion was not confirmed.
async function removeUnreachableCompany(input: {
  clerkOrgId: string;
  organisationId: string;
  connectionId: string;
  performedByUserId?: string | null;
}): Promise<Result<XeroDisconnectResult, DisconnectError>> {
  const result = await tenantTransaction(input.clerkOrgId, async (tx) => {
    await lockScopedXeroConnection(tx, input);
    const scope = {
      clerk_org_id: input.clerkOrgId,
      organisation_id: input.organisationId,
    };
    const released = await tx.xeroConnection.findFirst({
      select: { id: true },
      where: { ...scope, id: input.connectionId, released_at: { not: null } },
    });
    if (released) {
      return {
        ok: true as const,
        value: { connectionId: released.id, state: "disconnected" as const },
      };
    }
    const scoped = await getScopedXeroConnection(input, tx);
    if (
      !scoped.ok ||
      scoped.value.status === "disconnected" ||
      canReachXero(scoped.value)
    ) {
      return failure(
        "connection_changed",
        "The Xero connection changed. Try again."
      );
    }
    const writing = await tx.availabilityRecord.findFirst({
      select: { id: true },
      where: {
        ...scope,
        xero_write_claimed_at: {
          gte: new Date(Date.now() - XERO_WRITE_CLAIM_LEASE_MS),
        },
      },
    });
    if (writing) {
      return failure(
        "write_in_progress",
        "Finish the current Xero payroll write before removing this company."
      );
    }
    const connection = scoped.value;
    const now = new Date();
    await tx.xeroSyncCursor.deleteMany({
      where: { ...scope, xero_connection_id: connection.id },
    });
    await tx.xeroConnection.updateMany({
      data: {
        balance_next_person_id: null,
        disconnected_at: now,
        disconnected_by_user_id: input.performedByUserId,
        initial_sync_completed_at: null,
        initial_sync_requested_at: null,
        last_disconnected_at: now,
        leave_next_person_id: null,
        released_at: now,
        remote_connection_id: null,
        status: "disconnected",
        sync_paused_at: now,
        xero_authorisation_id: null,
      },
      where: { ...scope, id: connection.id, released_at: null },
    });
    await archiveCompanyState(tx, input, now);
    await tx.auditEvent.create({
      data: {
        ...scope,
        action: "company_removed",
        actor_user_id: input.performedByUserId,
        metadata: {
          previous_status: connection.status,
          remote_delete: "unreachable",
        },
        resource_id: connection.id,
        resource_type: "xero_connection",
      },
    });
    return {
      ok: true as const,
      value: { connectionId: connection.id, state: "disconnected" as const },
    };
  });
  if (result.ok) {
    await invalidateAccountFeedCaches({ clerkOrgId: input.clerkOrgId });
  }
  return result;
}

async function removePreviouslyDisconnectedCompany(input: {
  clerkOrgId: string;
  organisationId: string;
  connectionId: string;
  performedByUserId?: string | null;
}): Promise<Result<XeroDisconnectResult, DisconnectError>> {
  const result = await tenantTransaction(input.clerkOrgId, async (tx) => {
    await lockScopedXeroConnection(tx, input);
    const scope = {
      clerk_org_id: input.clerkOrgId,
      organisation_id: input.organisationId,
    };
    const connection = await tx.xeroConnection.findFirst({
      where: { ...scope, id: input.connectionId },
    });
    if (connection?.released_at) {
      return {
        ok: true as const,
        value: { connectionId: connection.id, state: "disconnected" as const },
      };
    }
    if (
      connection?.status !== "disconnected" ||
      !connection.disconnected_at ||
      connection.remote_connection_id ||
      connection.xero_authorisation_id
    ) {
      return failure(
        "connection_changed",
        "The Xero connection changed. Try again."
      );
    }
    // These audit actions are written only after remote DELETE returned 204/404.
    const confirmation = await tx.auditEvent.findFirst({
      select: { id: true },
      where: {
        ...scope,
        action: {
          in: [
            "xero.connection_disconnected_soft",
            "xero.connection_disconnected_destructive",
          ],
        },
        created_at: { gte: connection.disconnected_at },
        resource_id: connection.id,
        resource_type: "xero_connection",
      },
    });
    if (!confirmation) {
      return failure(
        "connection_inactive",
        "Reconnect Xero before removing this company."
      );
    }
    const now = new Date();
    await archiveCompanyState(tx, input, now);
    await tx.xeroConnection.updateMany({
      data: { released_at: now },
      where: {
        ...scope,
        id: connection.id,
        released_at: null,
        status: "disconnected",
      },
    });
    await tx.auditEvent.create({
      data: {
        ...scope,
        action: "company_removed",
        actor_user_id: input.performedByUserId,
        metadata: { confirmed_disconnect_audit_id: confirmation.id },
        resource_id: connection.id,
        resource_type: "xero_connection",
      },
    });
    return {
      ok: true as const,
      value: { connectionId: connection.id, state: "disconnected" as const },
    };
  });
  if (result.ok) {
    await invalidateAccountFeedCaches({ clerkOrgId: input.clerkOrgId });
  }
  return result;
}
