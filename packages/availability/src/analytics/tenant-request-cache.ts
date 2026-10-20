import "server-only";
import { assertTenantDb, type TenantDb } from "@repo/database";
import { type AggregationCache, createAggregationCache } from "./request-cache";

const tenantCaches = new WeakMap<TenantDb, AggregationCache>();
/** Memoised SQL snapshots belong to one active tenant request, including uncommitted rows. */
export function tenantAggregationCache(
  clerkOrgId: string,
  db: TenantDb
): AggregationCache {
  assertTenantDb(db, clerkOrgId);
  let cache = tenantCaches.get(db);
  if (!cache) {
    cache = createAggregationCache();
    tenantCaches.set(db, cache);
  }
  return cache;
}
