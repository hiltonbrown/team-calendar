import {
  assertXeroCampaignAccess,
  lockXeroCampaignPersistence,
} from "@repo/database/xero-campaign-access";
import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import type { Result } from "@repo/core";
import { database } from "@repo/database";
import type { Prisma } from "@repo/database/generated/client";
import {
  classifyXeroFailure,
  resolveXeroAccess,
  toResolvedXeroTenant,
  type XeroWriteError,
} from "@repo/xero";

export interface XeroSyncScope {
  bindingGeneration: number;
  clerkOrgId: string;
  organisationId: string;
  xeroTenantId: string;
}

export class XeroBindingChangedError extends Error {
  constructor() {
    super("generation_changed");
  }
}
export class XeroSyncRetryError extends Error {
  readonly recoveryReason: "retry_later" | "operational_incident";
  constructor(recoveryReason: "retry_later" | "operational_incident") {
    super(recoveryReason);
    this.recoveryReason = recoveryReason;
  }
}

const bindingTransactions = new AsyncLocalStorage<{
  scope: XeroSyncScope;
  tx: Prisma.TransactionClient;
  afterCommit: Array<() => Promise<void>>;
}>();

function sameBinding(a: XeroSyncScope, b: XeroSyncScope) {
  return (
    a.clerkOrgId === b.clerkOrgId &&
    a.organisationId === b.organisationId &&
    a.xeroTenantId === b.xeroTenantId &&
    a.bindingGeneration === b.bindingGeneration
  );
}

/** The comparison and actual batch writes share the disconnect/reconnect lock. */
export async function withXeroBinding<T>(
  scope: XeroSyncScope,
  operation: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  const current = bindingTransactions.getStore();
  if (current) {
    if (!sameBinding(current.scope, scope)) {
      throw new XeroBindingChangedError();
    }
    return operation(current.tx);
  }
  const afterCommit: Array<() => Promise<void>> = [];
  const result = await database.$transaction(
    async (tx) => {
      await lockXeroCampaignPersistence(scope, tx);
      await tx.$executeRaw`SELECT set_config('lock_timeout', ${"10000ms"}, true)`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`xero-binding:${scope.xeroTenantId}`}, 0))::text AS acquired`;
      const tenant = await tx.xeroTenant.findFirst({
        select: {
          id: true,
          xero_connection: { select: { last_error_code: true, status: true } },
          xero_credential_owner_id: true,
        },
        where: {
          active_slot: 1,
          binding_generation: scope.bindingGeneration,
          clerk_org_id: scope.clerkOrgId,
          id: scope.xeroTenantId,
          OR: [
            { xero_credential_owner_id: null },
            { credential_owner: { usability: "usable" } },
          ],
          organisation_id: scope.organisationId,
          retired_at: null,
          sync_paused_at: null,
          xero_connection: {
            disconnected_at: null,
            revoked_at: null,
            status: { in: ["active", "stale"] },
          },
        },
      });
      if (
        tenant &&
        !tenant.xero_credential_owner_id &&
        tenant.xero_connection?.status === "stale" &&
        [
          "invalid_grant",
          "refresh_invalid_grant",
          "refresh_token_invalid",
          "reauthorisation_required",
        ].includes(tenant.xero_connection.last_error_code ?? "")
      ) {
        throw new XeroBindingChangedError();
      }
      if (!tenant) {
        throw new XeroBindingChangedError();
      }
      const committedResult = await bindingTransactions.run(
        { afterCommit, scope, tx },
        () => operation(tx)
      );
      await assertXeroCampaignAccess(scope);
      return committedResult;
    },
    { maxWait: 10_000, timeout: 30_000 }
  );
  for (const effect of afterCommit) {
    await withXeroBinding(scope, async () => effect());
  }
  return result;
}

export async function resolveSyncTenant(
  scope: XeroSyncScope,
  capability: string | readonly string[]
) {
  await assertXeroCampaignAccess(scope);
  const loaded = await database.xeroTenant.findFirst({
    select: {
      approval_state_stale_since: true,
      id: true,
      leave_balances_stale_since: true,
      leave_records_stale_since: true,
      people_stale_since: true,
      sync_paused_at: true,
    },
    where: {
      active_slot: 1,
      binding_generation: scope.bindingGeneration,
      clerk_org_id: scope.clerkOrgId,
      id: scope.xeroTenantId,
      organisation_id: scope.organisationId,
    },
  });
  if (!loaded || loaded.sync_paused_at) {
    throw new XeroBindingChangedError();
  }
  const resolved = await resolveXeroAccess({
    capability,
    clerkOrgId: scope.clerkOrgId,
    deadline: { expiresAtMs: Date.now() + 120_000 },
    expectedBindingGeneration: scope.bindingGeneration,
    organisationId: scope.organisationId,
  });
  if (!resolved.ok) {
    if (
      ["not_connected", "disconnected", "generation_changed"].includes(
        resolved.error.code
      )
    ) {
      throw new XeroBindingChangedError();
    }
    return {
      error: {
        ...classifyXeroFailure({
          dispatched: false,
          error: resolved.error,
          isMutation: false,
        }),
        message: "Xero access failed.",
      },
      ok: false as const,
    };
  }
  if (resolved.value.xeroTenantDatabaseId !== scope.xeroTenantId) {
    throw new XeroBindingChangedError();
  }
  return {
    ok: true as const,
    value: {
      ...loaded,
      ...toResolvedXeroTenant(
        {
          capability,
          clerkOrgId: scope.clerkOrgId,
          organisationId: scope.organisationId,
        },
        resolved.value
      ),
    },
  };
}

export function syncFailureReason(error: XeroWriteError): string {
  if (error.recoveryReason) {
    return error.recoveryReason;
  }
  if (error.code === "auth_error") {
    return "reauthorise";
  }
  if (error.code === "permission_error") {
    return "access_denied";
  }
  return classifyXeroFailure({ dispatched: false, error, isMutation: false })
    .recoveryReason;
}

/** Publication reads must see committed canonical records, under the same current binding fence. */
export async function afterXeroBindingCommit(
  scope: XeroSyncScope,
  effect: () => Promise<void>
) {
  const current = bindingTransactions.getStore();
  if (current && sameBinding(current.scope, scope)) {
    current.afterCommit.push(effect);
    return;
  }
  await withXeroBinding(scope, async () => effect());
}
export function throwRetryableXeroFailure(error: XeroWriteError) {
  const reason = syncFailureReason(error);
  if (reason === "retry_later" || reason === "operational_incident") {
    throw new XeroSyncRetryError(reason);
  }
}

/** Results are service contracts; Inngest retries only a rejected step. */
export async function rejectRetryableSyncResult<T, E extends { code: string }>(
  operation: Promise<Result<T, E>>
): Promise<Result<T, E>> {
  const result = await operation;
  if (!result.ok && result.error.code !== "validation_error") {
    throw new Error("retry_later");
  }
  return result;
}
