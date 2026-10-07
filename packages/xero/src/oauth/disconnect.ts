import "server-only";
import { XERO_WRITE_CLAIM_LEASE_MS } from "@repo/availability";
import type { Result } from "@repo/core";
import { lockScopedXeroConnection, withXeroGrantLock } from "@repo/database";
import { getScopedXeroConnection } from "@repo/database/queries/xero-connections";
import { ALL_PRIVACY_MODES, invalidateFeedCache } from "@repo/feeds";
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
  performedByUserId?: string | null;
}): Promise<Result<XeroDisconnectResult, DisconnectError>> {
  try {
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
            sync_paused_at: now,
            xero_authorisation_id: null,
          },
          where: { ...scope, id: connection.id },
        });
        const feeds = input.destructive
          ? await tx.feed.findMany({ select: { id: true }, where: scope })
          : [];
        if (input.destructive) {
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
        await tx.auditEvent.create({
          data: {
            ...scope,
            action: input.destructive
              ? "xero.connection_disconnected_destructive"
              : "xero.connection_disconnected_soft",
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
      return { ok: true, value: result.value };
    }
    return result;
  } catch {
    return failure();
  }
}
