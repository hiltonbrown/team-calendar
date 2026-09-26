import "server-only";

import { randomUUID } from "node:crypto";
import type { Result } from "@repo/core";
import { database } from "@repo/database";
import type { Prisma } from "@repo/database/generated/client";
import type { xero_cleanup_attempt_state } from "@repo/database/generated/enums";
import {
  claimXeroCleanupAttempt,
  markXeroCleanupAttemptDispatching,
  recordXeroCleanupAttemptOutcome,
  type XeroCleanupOutcomeReason,
} from "@repo/database/queries/xero-cleanup";
import { keys } from "../../keys";
import { createXeroDeadline } from "../rate-limit/deadline";
import { boundXeroLocks, lockXeroBinding } from "./locks";
import { deleteXeroConnection } from "./management-client";

export interface XeroDisconnectReceipt {
  cleanupRequestId: string | null;
  dataActionStatus: "not_requested" | "pending" | "completed" | "failed";
  localDisabled: true;
  remoteStatus:
    | "not_applicable"
    | "left_in_place"
    | "pending"
    | "confirmed_deleted"
    | "confirmed_absent"
    | "partially_confirmed"
    | "unknown"
    | "blocked_authorisation";
}

interface AttemptSummary {
  outcome_reason: string | null;
  state: xero_cleanup_attempt_state;
}
export function aggregateXeroDisconnectReceipt(
  attempts: readonly AttemptSummary[]
): XeroDisconnectReceipt["remoteStatus"] {
  if (!attempts.length) {
    return "not_applicable";
  }
  if (
    attempts.every(
      (a) => a.state === "cancelled" && a.outcome_reason === "report_only"
    )
  ) {
    return "left_in_place";
  }
  if (
    attempts.some((a) => a.state === "unknown" || a.state === "dispatching")
  ) {
    return "unknown";
  }
  if (attempts.some((a) => a.state === "blocked_authorisation")) {
    return "blocked_authorisation";
  }
  const confirmed = attempts.filter(
    (a) => a.state === "confirmed_deleted" || a.state === "confirmed_absent"
  );
  if (confirmed.length === attempts.length) {
    return confirmed.some((a) => a.state === "confirmed_deleted")
      ? "confirmed_deleted"
      : "confirmed_absent";
  }
  if (attempts.some((a) => a.state === "cancelled")) {
    return confirmed.length ? "partially_confirmed" : "unknown";
  }
  return confirmed.length ? "partially_confirmed" : "pending";
}

export function freezeCleanupTargets(input: {
  providerAppId: string;
  externalTenantId: string;
  ownerId: string | null;
  legacyRemoteConnectionId: string | null;
  providerConnections: readonly {
    provider_app_id: string;
    xero_tenant_id: string;
    xero_credential_owner_id: string | null;
    remote_connection_id: string;
  }[];
}): string[] {
  const targets = new Set<string>();
  if (input.ownerId) {
    for (const row of input.providerConnections) {
      if (
        row.provider_app_id === input.providerAppId &&
        row.xero_tenant_id === input.externalTenantId &&
        row.xero_credential_owner_id === input.ownerId
      ) {
        targets.add(row.remote_connection_id);
      }
    }
  }
  if (input.legacyRemoteConnectionId) {
    targets.add(input.legacyRemoteConnectionId);
  }
  return [...targets];
}

export async function getXeroDisconnectReceipt(input: {
  clerkOrgId: string;
  organisationId: string;
  cleanupRequestId: string;
  client?: Prisma.TransactionClient;
}): Promise<XeroDisconnectReceipt> {
  const request = await (input.client ?? database).xeroCleanupRequest.findFirst(
    {
      include: { attempts: true },
      where: {
        clerk_org_id: input.clerkOrgId,
        id: input.cleanupRequestId,
        organisation_id: input.organisationId,
      },
    }
  );
  if (!request) {
    throw new Error("Cleanup request not found.");
  }
  return {
    cleanupRequestId: request.id,
    dataActionStatus: request.data_action_status,
    localDisabled: true,
    remoteStatus: aggregateXeroDisconnectReceipt(request.attempts),
  };
}

export function mapDeleteOutcomeToState(
  outcome: Awaited<ReturnType<typeof deleteXeroConnection>>
): {
  state: xero_cleanup_attempt_state;
  outcomeReason: XeroCleanupOutcomeReason;
  retryAfterMs?: number;
} {
  switch (outcome.kind) {
    case "deleted":
      return { outcomeReason: "deleted", state: "confirmed_deleted" };
    case "absent":
      return { outcomeReason: "absent", state: "confirmed_absent" };
    case "auth_failed":
      return { outcomeReason: "auth_failed", state: "blocked_authorisation" };
    case "rate_limited":
      return {
        outcomeReason: "rate_limited",
        retryAfterMs: outcome.retryAfterMs ?? undefined,
        state: "pending",
      };
    case "not_sent":
      return { outcomeReason: "not_sent", state: "pending" };
    case "server_error":
      return { outcomeReason: "server_error", state: "unknown" };
    default:
      return { outcomeReason: "unknown", state: "unknown" };
  }
}

interface CleanupScope {
  attemptId: string;
  clerkOrgId: string;
  organisationId: string;
}
export async function processXeroCleanupAttempt(
  input: CleanupScope,
  deps: { deleteImpl?: typeof deleteXeroConnection; now?: () => Date } = {}
): Promise<void> {
  if (keys().XERO_REMOTE_CLEANUP_MODE !== "enabled") {
    return;
  }
  const clock = deps.now ?? (() => new Date());
  const now = clock();
  const leaseOwner = randomUUID();
  const prior = await database.xeroCleanupAttempt.findFirst({
    where: {
      clerk_org_id: input.clerkOrgId,
      id: input.attemptId,
      organisation_id: input.organisationId,
    },
  });
  if (!prior) {
    return;
  }
  if (
    prior.state === "dispatching" &&
    prior.lease_expires_at &&
    prior.lease_expires_at <= now
  ) {
    await database.xeroCleanupAttempt.updateMany({
      data: {
        lease_expires_at: null,
        lease_owner: null,
        outcome_reason: "lease_expired",
        state: "unknown",
      },
      where: {
        clerk_org_id: input.clerkOrgId,
        id: prior.id,
        lease_expires_at: { lte: now },
        lease_owner: prior.lease_owner,
        organisation_id: input.organisationId,
        state: "dispatching",
      },
    });
    return;
  }
  const claimed = await claimXeroCleanupAttempt({
    ...input,
    leaseExpiresAt: new Date(now.getTime() + 120_000),
    leaseOwner,
    now,
  });
  if (!claimed) {
    return;
  }
  await dispatchClaimedCleanup({ ...input, leaseOwner }, deps);
}

async function dispatchClaimedCleanup(
  input: CleanupScope & { leaseOwner: string },
  deps: { deleteImpl?: typeof deleteXeroConnection; now?: () => Date }
): Promise<void> {
  const clock = deps.now ?? (() => new Date());
  const deadline = createXeroDeadline(90_000);
  const target = await database.$transaction(
    async (tx) => {
      await boundXeroLocks(tx, deadline);
      const attempt = await tx.xeroCleanupAttempt.findFirst({
        include: { request: true },
        where: {
          clerk_org_id: input.clerkOrgId,
          id: input.attemptId,
          lease_expires_at: { gt: clock() },
          lease_owner: input.leaseOwner,
          organisation_id: input.organisationId,
          state: "claimed",
        },
      });
      if (!attempt) {
        return null;
      }
      await lockXeroBinding(tx, attempt.request.xero_tenant_id);
      const tenant = await tx.xeroTenant.findFirst({
        where: {
          clerk_org_id: input.clerkOrgId,
          id: attempt.request.xero_tenant_id,
          organisation_id: input.organisationId,
        },
      });
      if (
        !tenant ||
        tenant.binding_generation !== attempt.expected_binding_generation ||
        attempt.request.binding_generation !==
          attempt.expected_binding_generation ||
        tenant.provider_app_id !== attempt.provider_app_id
      ) {
        await tx.xeroCleanupAttempt.updateMany({
          data: {
            lease_expires_at: null,
            lease_owner: null,
            outcome_reason: "superseded",
            state: "cancelled",
          },
          where: {
            clerk_org_id: input.clerkOrgId,
            id: attempt.id,
            lease_expires_at: { gt: clock() },
            lease_owner: input.leaseOwner,
            organisation_id: input.organisationId,
            state: "claimed",
          },
        });
        return null;
      }
      const marked = await markXeroCleanupAttemptDispatching({
        ...input,
        client: tx,
        deadlineAt: new Date(deadline.expiresAtMs),
        now: clock(),
      });
      return marked ? attempt : null;
    },
    { timeout: 20_000 }
  );
  if (!target) {
    return;
  }
  let outcome: Awaited<ReturnType<typeof deleteXeroConnection>>;
  try {
    outcome = await (deps.deleteImpl ?? deleteXeroConnection)({
      deadline,
      expectedProviderAppId: target.provider_app_id,
      remoteConnectionId: target.remote_connection_id,
    });
  } catch {
    outcome = { kind: "unknown" };
  }
  const mapped = mapDeleteOutcomeToState(outcome);
  const now = clock();
  const backoff = Math.min(
    3_600_000,
    60_000 * 2 ** Math.min(target.retry_count, 6)
  );
  const recorded = await recordXeroCleanupAttemptOutcome({
    ...input,
    nextAttemptAt:
      mapped.state === "pending"
        ? new Date(
            now.getTime() +
              (mapped.retryAfterMs ??
                backoff + Math.floor((Math.random() * backoff) / 4))
          )
        : null,
    now,
    outcomeReason: mapped.outcomeReason,
    state: mapped.state,
  });
  if (recorded) {
    await retireResolvedCleanupRequest({
      ...input,
      requestId: target.xero_cleanup_request_id,
    });
  }
}

export async function retireResolvedCleanupRequest(input: {
  clerkOrgId: string;
  organisationId: string;
  requestId: string;
}): Promise<void> {
  await database.$transaction(
    async (tx) => {
      await boundXeroLocks(tx, createXeroDeadline(10_000));
      const request = await tx.xeroCleanupRequest.findFirst({
        include: { attempts: true },
        where: {
          clerk_org_id: input.clerkOrgId,
          id: input.requestId,
          organisation_id: input.organisationId,
        },
      });
      if (!request) {
        return;
      }
      await lockXeroBinding(tx, request.xero_tenant_id);
      if (
        !request.attempts.every(
          (a) =>
            a.state === "confirmed_deleted" ||
            a.state === "confirmed_absent" ||
            a.state === "cancelled"
        )
      ) {
        return;
      }
      await tx.xeroTenant.updateMany({
        data: {
          active_slot: null,
          retired_at: new Date(),
          retirement_reason: "disconnected",
        },
        where: {
          binding_generation: request.binding_generation,
          clerk_org_id: input.clerkOrgId,
          id: request.xero_tenant_id,
          organisation_id: input.organisationId,
        },
      });
    },
    { timeout: 20_000 }
  );
}

export async function reissueXeroCleanupAttempt(
  input: CleanupScope & {
    operatorUserId: string;
    expectedProviderAppId: string;
    expectedRemoteConnectionId: string;
    expectedBindingGeneration: number;
    confirmReissue: true;
  }
): Promise<Result<XeroDisconnectReceipt, { code: string; message: string }>> {
  if (
    keys().XERO_REMOTE_CLEANUP_MODE !== "enabled" ||
    input.confirmReissue !== true ||
    !input.operatorUserId.trim()
  ) {
    return {
      error: {
        code: "reissue_not_authorised",
        message:
          "Explicit enabled cleanup and operator confirmation are required.",
      },
      ok: false,
    };
  }
  const leaseOwner = randomUUID();
  const claimed = await database.$transaction(
    async (tx) => {
      await boundXeroLocks(tx, createXeroDeadline(10_000));
      const attempt = await tx.xeroCleanupAttempt.findFirst({
        include: { request: true },
        where: {
          clerk_org_id: input.clerkOrgId,
          expected_binding_generation: input.expectedBindingGeneration,
          id: input.attemptId,
          organisation_id: input.organisationId,
          provider_app_id: input.expectedProviderAppId,
          remote_connection_id: input.expectedRemoteConnectionId,
          state: "unknown",
        },
      });
      if (!attempt || attempt.provider_app_id !== keys().XERO_CLIENT_ID) {
        return null;
      }
      await lockXeroBinding(tx, attempt.request.xero_tenant_id);
      const tenant = await tx.xeroTenant.findFirst({
        where: {
          binding_generation: attempt.expected_binding_generation,
          clerk_org_id: input.clerkOrgId,
          id: attempt.request.xero_tenant_id,
          organisation_id: input.organisationId,
          provider_app_id: attempt.provider_app_id,
        },
      });
      if (tenant?.active_slot !== 1 || tenant.retired_at) {
        return null;
      }
      const now = new Date();
      const changed = await tx.xeroCleanupAttempt.updateMany({
        data: {
          correlation_id: input.operatorUserId,
          lease_expires_at: new Date(now.getTime() + 120_000),
          lease_owner: leaseOwner,
          outcome_reason: "operator_reissue",
          state: "claimed",
        },
        where: {
          clerk_org_id: input.clerkOrgId,
          id: attempt.id,
          lease_expires_at: attempt.lease_expires_at,
          lease_owner: attempt.lease_owner,
          organisation_id: input.organisationId,
          state: "unknown",
        },
      });
      return changed.count === 1 ? attempt.xero_cleanup_request_id : null;
    },
    { timeout: 20_000 }
  );
  if (!claimed) {
    return {
      error: {
        code: "reissue_rejected",
        message: "The frozen unresolved cleanup target no longer matches.",
      },
      ok: false,
    };
  }
  await dispatchClaimedCleanup({ ...input, leaseOwner }, {});
  return {
    ok: true,
    value: await getXeroDisconnectReceipt({
      ...input,
      cleanupRequestId: claimed,
    }),
  };
}
