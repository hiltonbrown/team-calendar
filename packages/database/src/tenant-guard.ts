import { AsyncLocalStorage } from "node:async_hooks";

export class TenantNestingError extends Error {
  name = "TenantNestingError";
}
export class TenantPhaseError extends Error {
  name = "TenantPhaseError";
}

const activeScope = new AsyncLocalStorage<{
  active: boolean;
  accountId: string;
}>();

export const isTenantScopeActive = (): boolean =>
  activeScope.getStore()?.active ?? false;

export const runInTenantScope = <T>(
  scope: { active: boolean; accountId: string },
  fn: () => T
): T => activeScope.run(scope, fn);

export const assertNoTenantTransaction = (operation: string): void => {
  if (isTenantScopeActive()) {
    throw new TenantPhaseError(
      `${operation} must run outside a tenant transaction`
    );
  }
};
