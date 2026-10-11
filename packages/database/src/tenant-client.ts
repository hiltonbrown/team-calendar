import "server-only";
import type { Prisma, PrismaClient } from "../generated/client";
import { keys } from "../keys";
import { createLazyClient } from "./lazy-client";
import { assertTestDatabaseConnectionAllowed } from "./live-test-guard";
import { createStandaloneDatabaseClient } from "./standalone-client";

export const referenceDatabase = createLazyClient({
  create: () => {
    const connectionString = keys().DATABASE_APP_URL;
    if (!connectionString) {
      throw new Error(
        "DATABASE_APP_URL is required for tenant database access"
      );
    }
    return createStandaloneDatabaseClient(connectionString);
  },
  guard: () =>
    assertTestDatabaseConnectionAllowed(process.env.DATABASE_APP_URL),
});
const assertTenant = (clerkOrgId: string): void => {
  if (!clerkOrgId.trim()) {
    throw new Error(
      "Clerk organisation is required for tenant database access"
    );
  }
};

export type TenantDatabase = Omit<PrismaClient, "$transaction">;

export const tenantDatabase = (clerkOrgId: string): TenantDatabase => {
  assertTenant(clerkOrgId);
  return referenceDatabase.$extends({
    query: {
      $allOperations: async ({ args, query }) => {
        const [, result] = await referenceDatabase.$transaction([
          referenceDatabase.$queryRaw`SELECT set_config('app.clerk_org_id', ${clerkOrgId}, true)`,
          query(args),
        ]);
        return result;
      },
    },
    // Query-only extensions preserve every delegate and result shape. Prisma
    // types Exact differently from the plain client used by transaction helpers.
  }) as unknown as TenantDatabase;
};

// Account-wide reads (calendar, feed projection) span every company and can
// outlast Prisma's 5s interactive default on serverless Postgres.
export const TENANT_READ_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 30_000,
} as const;

export const tenantTransaction = <T>(
  clerkOrgId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: {
    maxWait?: number;
    timeout?: number;
    isolationLevel?: Prisma.TransactionIsolationLevel;
  }
): Promise<T> => {
  assertTenant(clerkOrgId);
  return referenceDatabase.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('app.clerk_org_id', ${clerkOrgId}, true)`;
    return fn(tx);
  }, options);
};
