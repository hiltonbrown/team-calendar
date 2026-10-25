import "server-only";

import { createHash } from "node:crypto";
import { systemDatabase } from "@repo/database/system";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { createBetterAuthOptions } from "../better-auth-options";
import { parseBetterAuthEnvironment } from "../keys";

function createServer() {
  const env = parseBetterAuthEnvironment();
  return betterAuth(
    createBetterAuthOptions(
      env,
      prismaAdapter(systemDatabase, {
        provider: "postgresql",
        transaction: true,
      })
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
  const clientAddress = process.env.VERCEL
    ? (request.headers.get("x-vercel-forwarded-for") ?? "unknown")
    : "development";
  const key = `auth-context:${createHash("sha256").update(clientAddress).digest("hex")}`;
  const now = BigInt(Date.now());
  const rows = await systemDatabase.$queryRaw<{ count: number }[]>`
    INSERT INTO auth_rate_limits (id, key, count, last_request, created_at, updated_at)
    VALUES (gen_random_uuid(), ${key}, 1, ${now}, now(), now())
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN auth_rate_limits.last_request <= ${now - 60000n}
        THEN 1 ELSE LEAST(auth_rate_limits.count + 1, 101) END,
      last_request = CASE WHEN auth_rate_limits.last_request <= ${now - 60000n}
        THEN ${now} ELSE auth_rate_limits.last_request END,
      updated_at = now()
    RETURNING count
  `;
  return rows.length === 1 && rows[0].count <= 100;
}
