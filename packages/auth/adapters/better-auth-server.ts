import "server-only";

import type { AccountId } from "@repo/core";
import { assertNoTenantTransaction, withTenantResult } from "@repo/database";
import { systemDatabase } from "@repo/database/system";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { z } from "zod";
import { createBetterAuthOptions } from "../better-auth-options";
import { authContextBuckets } from "../context-rate-limit";
import { getAuthOrigins } from "../cookie-transport";
import { parseBetterAuthEnvironment } from "../keys";
import { completeAuthUserLifecycle } from "../user-lifecycle";

function createServer() {
  const env = parseBetterAuthEnvironment();
  return betterAuth(
    createBetterAuthOptions(
      env,
      prismaAdapter(systemDatabase, {
        provider: "postgresql",
        transaction: true,
      }),
      {
        afterUserCreated: (userId) =>
          completeAuthUserLifecycle(userId, "user.created"),
        afterUserUpdated: (userId) =>
          completeAuthUserLifecycle(userId, "user.updated"),
      }
    )
  );
}

let server: ReturnType<typeof createServer> | undefined;

/** Initialised only on the selected auth host, never by the API resolver client. */
export function getBetterAuth() {
  server ??= createServer();
  return server;
}

/** The custom resolver bypasses the native HTTP limiter, so consumes its own DB bucket. */
export async function consumeAuthContextRateLimit(
  request: Request
): Promise<boolean> {
  const buckets = authContextBuckets(
    request,
    getAuthOrigins().appOrigin,
    Boolean(process.env.VERCEL)
  );
  const now = BigInt(Date.now());
  // Each bucket uses one atomic upsert. Address admission runs first, bounding
  // attempts to manufacture new session keys without affecting other users.
  for (const { key, limit } of buckets) {
    const rows = await systemDatabase.$queryRaw<{ count: number }[]>`
      INSERT INTO auth_rate_limits (id, key, count, last_request, created_at, updated_at)
      VALUES (gen_random_uuid(), ${key}, 1, ${now}, now(), now())
      ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN auth_rate_limits.last_request <= ${now - 60000n}
          THEN 1 ELSE LEAST(auth_rate_limits.count + 1, ${limit + 1}) END,
        last_request = CASE WHEN auth_rate_limits.last_request <= ${now - 60000n}
          THEN ${now} ELSE auth_rate_limits.last_request END,
        updated_at = now()
      RETURNING count
    `;
    if (rows.length !== 1 || rows[0].count > limit) {
      return false;
    }
  }
  return true;
}

const bootstrapMetadata = z.object({ bootstrapTimeZone: z.string().min(1) });

/** Retryable domain phase, called after auth commit and before product access. */
export async function ensureUserAccountsReady(userId: string): Promise<void> {
  assertNoTenantTransaction("ensureUserAccountsReady");
  const memberships = await systemDatabase.authMember.findMany({
    include: { account: true },
    where: { user_id: userId },
  });
  for (const { account } of memberships) {
    if (account.provisioning_status === "ready") {
      continue;
    }
    if (account.country_code !== "AU") {
      throw new Error(
        "This Account cannot be provisioned in the current release"
      );
    }
    const metadata = bootstrapMetadata.parse(
      JSON.parse(account.metadata ?? "{}")
    );
    // Auth Account UUIDs are neutral tenant IDs; domain storage remains text
    // until the coordinated clean-reset cutover.
    const accountId = account.id as AccountId;
    const result = await withTenantResult(accountId, async (db) => {
      await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`auth-bootstrap:${account.id}`}, 0))`;
      let company = await db.organisation.findFirst({
        orderBy: { created_at: "asc" },
        where: { account_id: account.id },
      });
      if (!company) {
        company = await db.organisation.create({
          data: {
            account_id: account.id,
            country_code: account.country_code,
            name: account.name,
            timezone: metadata.bootstrapTimeZone,
          },
        });
      }
      await db.accountSettings.upsert({
        create: { account_id: account.id },
        update: {},
        where: { account_id: account.id },
      });
      return { ok: true, value: company.id };
    });
    if (!result.ok) {
      throw new Error("Account setup could not finish. Please try again");
    }
    await systemDatabase.authOrganization.update({
      data: { provisioning_status: "ready" },
      where: { id: account.id },
    });
  }
}
