import { createHash } from "node:crypto";
import { executeRedisRestCommand } from "@repo/core";
import { keys as feedsKeys } from "@repo/feeds/keys";
import { log } from "@repo/observability/log";

export const SUPPORT_RATE_LIMITS = {
  ORGANISATION: {
    limit: 20,
    windowSeconds: 60 * 60,
  },
  USER: {
    limit: 5,
    windowSeconds: 15 * 60,
  },
} as const;

export interface SupportRateLimitResult {
  allowed: boolean;
  retryAfter?: number;
}

export interface SupportRateLimiterClient {
  eval: (
    script: string,
    keys: string[],
    args: (number | string)[]
  ) => Promise<[number, number, number, number]>;
}

let customLimiterClient: SupportRateLimiterClient | null = null;
let customLimiterResolved = false;

export function setSupportRateLimiterClientForTests(
  client: SupportRateLimiterClient | null
): void {
  customLimiterClient = client;
  customLimiterResolved = true;
}

export function hashSupportRateLimitIdentifier(identifier: string): string {
  return createHash("sha256").update(identifier).digest("hex");
}

const RATE_LIMIT_LUA_SCRIPT = `
local userCurrent = redis.call('INCR', KEYS[1])
local userTtl = redis.call('TTL', KEYS[1])
if userTtl < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
  userTtl = tonumber(ARGV[1])
end

local organisationCurrent = redis.call('INCR', KEYS[2])
local organisationTtl = redis.call('TTL', KEYS[2])
if organisationTtl < 0 then
  redis.call('EXPIRE', KEYS[2], ARGV[2])
  organisationTtl = tonumber(ARGV[2])
end

return {userCurrent, userTtl, organisationCurrent, organisationTtl}
`;

function isRateLimitIncrementResult(
  value: unknown
): value is [number, number, number, number] {
  return (
    Array.isArray(value) &&
    value.length >= 4 &&
    value.slice(0, 4).every((entry) => typeof entry === "number")
  );
}

async function executeRateLimitIncrement(
  userKey: string,
  organisationKey: string
): Promise<[number, number, number, number] | null> {
  if (customLimiterResolved) {
    if (!customLimiterClient) {
      return null;
    }

    return customLimiterClient.eval(
      RATE_LIMIT_LUA_SCRIPT,
      [userKey, organisationKey],
      [
        SUPPORT_RATE_LIMITS.USER.windowSeconds,
        SUPPORT_RATE_LIMITS.ORGANISATION.windowSeconds,
      ]
    );
  }

  const { KV_REST_API_TOKEN, KV_REST_API_URL } = feedsKeys();
  if (!(KV_REST_API_URL && KV_REST_API_TOKEN)) {
    return null;
  }

  const result = await executeRedisRestCommand<unknown>({
    command: [
      "EVAL",
      RATE_LIMIT_LUA_SCRIPT,
      2,
      userKey,
      organisationKey,
      String(SUPPORT_RATE_LIMITS.USER.windowSeconds),
      String(SUPPORT_RATE_LIMITS.ORGANISATION.windowSeconds),
    ],
    token: KV_REST_API_TOKEN,
    url: KV_REST_API_URL,
  });

  if (!result.ok) {
    log.warn("Support rate limiter Redis transport error, failing open", {
      code: result.error.code,
    });
    return null;
  }

  if (!isRateLimitIncrementResult(result.value)) {
    log.warn(
      "Support rate limiter unexpected Redis response format, failing open"
    );
    return null;
  }

  return result.value;
}

export async function checkSupportRateLimit(input: {
  clerkOrgId: string;
  userId: string;
}): Promise<SupportRateLimitResult> {
  const userKey = `ratelimit:support:user:${hashSupportRateLimitIdentifier(input.userId)}`;
  const organisationKey = `ratelimit:support:organisation:${hashSupportRateLimitIdentifier(input.clerkOrgId)}`;

  try {
    const incrementResult = await executeRateLimitIncrement(
      userKey,
      organisationKey
    );

    if (!incrementResult) {
      return { allowed: true };
    }

    const [userCurrent, userTtl, organisationCurrent, organisationTtl] =
      incrementResult;
    const userExceeded = userCurrent > SUPPORT_RATE_LIMITS.USER.limit;
    const organisationExceeded =
      organisationCurrent > SUPPORT_RATE_LIMITS.ORGANISATION.limit;

    if (!(userExceeded || organisationExceeded)) {
      return { allowed: true };
    }

    let userRetryAfter = 0;
    if (userExceeded) {
      userRetryAfter =
        userTtl > 0 ? userTtl : SUPPORT_RATE_LIMITS.USER.windowSeconds;
    }

    let organisationRetryAfter = 0;
    if (organisationExceeded) {
      organisationRetryAfter =
        organisationTtl > 0
          ? organisationTtl
          : SUPPORT_RATE_LIMITS.ORGANISATION.windowSeconds;
    }

    const retryAfter = Math.max(userRetryAfter, organisationRetryAfter);

    log.warn("Support issue creation rate limit exceeded", {
      organisationLimitExceeded: organisationExceeded,
      retryAfter,
      userLimitExceeded: userExceeded,
    });

    return { allowed: false, retryAfter };
  } catch (error) {
    log.warn("Support rate limit check failed, failing open", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return { allowed: true };
  }
}
