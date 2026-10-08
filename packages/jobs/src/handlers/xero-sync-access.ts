import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Result } from "@repo/core";
import { database } from "@repo/database";
import type { Prisma } from "@repo/database/generated/client";
import {
  classifyXeroFailure,
  resolveXeroAccess,
  toResolvedXeroConnection,
  type XeroWriteError,
} from "@repo/xero";
export interface XeroSyncScope {
  clerkOrgId: string;
  connectionId: string;
  expectedXeroTenantId?: string;
  organisationId: string;
  requestedAt?: string;
}
export class XeroBindingChangedError extends Error {
  constructor() {
    super("connection_changed");
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
    a.connectionId === b.connectionId
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
      await tx.$executeRaw`SELECT set_config('lock_timeout', ${"10000ms"}, true)`;
      await tx.$queryRaw`SELECT id FROM xero_connections WHERE id = ${scope.connectionId}::uuid AND clerk_org_id = ${scope.clerkOrgId} AND organisation_id = ${scope.organisationId}::uuid FOR UPDATE`;
      const connection = await tx.xeroConnection.findFirst({
        select: { id: true },
        where: {
          authorisation: { status: "active" },
          clerk_org_id: scope.clerkOrgId,
          id: scope.connectionId,
          organisation_id: scope.organisationId,
          status: "active",
          sync_paused_at: null,
          ...(scope.expectedXeroTenantId
            ? { xero_tenant_id: scope.expectedXeroTenantId }
            : {}),
          ...(scope.requestedAt
            ? { initial_sync_requested_at: new Date(scope.requestedAt) }
            : {}),
        },
      });
      if (!connection) {
        throw new XeroBindingChangedError();
      }
      const committedResult = await bindingTransactions.run(
        { afterCommit, scope, tx },
        () => operation(tx)
      );
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
  const loaded = await database.xeroConnection.findFirst({
    select: {
      approval_state_stale_since: true,
      id: true,
      leave_balances_stale_since: true,
      leave_records_stale_since: true,
      people_stale_since: true,
      sync_cursors: { select: { entity_type: true, modified_since: true } },
      sync_paused_at: true,
    },
    where: {
      clerk_org_id: scope.clerkOrgId,
      id: scope.connectionId,
      organisation_id: scope.organisationId,
    },
  });
  if (!loaded || loaded.sync_paused_at) {
    throw new XeroBindingChangedError();
  }
  const resolved = await resolveXeroAccess({
    capability,
    clerkOrgId: scope.clerkOrgId,
    connectionId: scope.connectionId,
    deadline: { expiresAtMs: Date.now() + 120_000 },
    organisationId: scope.organisationId,
  });
  if (!resolved.ok) {
    if (
      ["not_connected", "disconnected", "connection_changed"].includes(
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
  if (resolved.value.connectionId !== scope.connectionId) {
    throw new XeroBindingChangedError();
  }
  return {
    ok: true as const,
    value: {
      ...loaded,
      ...toResolvedXeroConnection(
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
export async function rejectRetryableSyncResult<
  T,
  E extends {
    code: string;
  },
>(operation: Promise<Result<T, E>>): Promise<Result<T, E>> {
  const result = await operation;
  if (!result.ok && result.error.code !== "validation_error") {
    throw new Error("retry_later");
  }
  return result;
}
