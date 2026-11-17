import "server-only";
import type { Result } from "@repo/core";
import { parseError } from "@repo/observability/error";
import { log } from "@repo/observability/log";
import type { Prisma } from "../generated/client";
import { referenceDatabase } from "./tenant-client";
import {
  isTenantScopeActive,
  runInTenantScope,
  TenantNestingError,
} from "./tenant-guard";

export {
  assertNoTenantTransaction,
  isTenantScopeActive,
  TenantNestingError,
  TenantPhaseError,
} from "./tenant-guard";

declare const tenantDbBrand: unique symbol;
export type TenantDb = Prisma.TransactionClient & {
  readonly [tenantDbBrand]: true;
};

export interface TenantTransactionOptions {
  isolationLevel?: Prisma.TransactionIsolationLevel;
  maxWait?: number;
  timeout?: number;
}

export const TENANT_REQUEST_OPTIONS = {
  maxWait: 5000,
  timeout: 15_000,
} as const;
export const TENANT_READ_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 30_000,
} as const;

export class TenantMismatchError extends Error {
  name = "TenantMismatchError";
}
class TenantRollback extends Error {}

type Effect = () => Promise<void>;
const owners = new WeakMap<object, string>();
const effects = new WeakMap<object, Effect[]>();
export const assertTenantDb = (db: TenantDb, accountId: string): void => {
  if (owners.get(db) !== accountId) {
    throw new TenantMismatchError(
      "Tenant client does not belong to this Account"
    );
  }
};

export const afterTenantCommit = (db: TenantDb, effect: Effect): void => {
  const pending = effects.get(db);
  if (!pending) {
    throw new TenantMismatchError(
      "Tenant client has no active effect registration"
    );
  }
  pending.push(effect);
};

const runEffect = async (effect: Effect): Promise<void> => {
  try {
    await effect();
    return;
  } catch {
    // A fire-and-forget effect gets one immediate retry after commit.
  }
  try {
    await effect();
  } catch (error) {
    try {
      log.error("tenant_after_commit_failed", { error });
    } catch {
      // Reporting cannot reject an already committed request.
    }
    try {
      parseError(error);
    } catch {
      // Preserve the committed result even if the reporting transport fails.
    }
  }
};

export const withTenantDb = async <T>(
  accountId: string,
  fn: (db: TenantDb) => Promise<T>,
  options: TenantTransactionOptions = TENANT_REQUEST_OPTIONS
): Promise<T> => {
  if (!accountId.trim()) {
    throw new Error("Account is required for tenant database access");
  }
  if (isTenantScopeActive()) {
    throw new TenantNestingError(
      "A tenant transaction is already active; pass its client explicitly"
    );
  }
  const pending: Effect[] = [];
  const scope = { accountId, active: true };
  let registered: Prisma.TransactionClient | undefined;
  let result: T;
  try {
    result = await runInTenantScope(scope, () =>
      referenceDatabase.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT set_config('app.account_id', ${accountId}, true)`;
        registered = tx;
        owners.set(tx, accountId);
        effects.set(tx, pending);
        // The brand is a phantom type; runtime ownership is held in owners.
        return fn(tx as TenantDb);
      }, options)
    );
  } finally {
    scope.active = false;
    if (registered) {
      owners.delete(registered);
      effects.delete(registered);
    }
  }
  for (const effect of pending) {
    await runEffect(effect);
  }
  return result;
};

export const withTenantResult = async <T, E>(
  accountId: string,
  fn: (db: TenantDb) => Promise<Result<T, E>>,
  options?: TenantTransactionOptions
): Promise<Result<T, E>> => {
  const rollback = new TenantRollback();
  let failure: Result<T, E> | undefined;
  try {
    return await withTenantDb(
      accountId,
      async (db) => {
        const result = await fn(db);
        if (!result.ok) {
          failure = result;
          throw rollback;
        }
        return result;
      },
      options
    );
  } catch (error) {
    if (error === rollback && failure) {
      return failure;
    }
    throw error;
  }
};

export const withTenantReads = async <K extends string, V>(
  accountId: string,
  branches: Record<K, (db: TenantDb) => Promise<V>>,
  options?: TenantTransactionOptions
): Promise<Record<K, V>> => {
  if (isTenantScopeActive()) {
    throw new TenantNestingError(
      "Tenant fan-out must start outside a transaction"
    );
  }
  // Object.keys reflects the branch keys supplied by the caller.
  const branchKeys = Object.keys(branches) as K[];
  const results = await Promise.all(
    branchKeys.map(
      async (key) =>
        [key, await withTenantDb(accountId, branches[key], options)] as const
    )
  );
  // Every input key has exactly one resolved result in this mapping.
  return Object.fromEntries(results) as Record<K, V>;
};
