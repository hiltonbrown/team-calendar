import { createHash } from "node:crypto";
import { executeRedisRestCommand } from "@repo/core";
import { keys as feedsKeys } from "@repo/feeds/keys";
import { log } from "@repo/observability/log";

export const FEED_RATE_LIMITS = {
  CLIENT_IP: {
    limit: 60,
    windowSeconds: 60,
  },
  TOKEN_PROBE: {
    limit: 120,
    windowSeconds: 60,
  },
} as const;

export interface RateLimitCheckResult {
  allowed: boolean;
  remaining?: number;
  resetInSeconds?: number;
  retryAfter?: number;
}

export interface FeedRateLimiterClient {
  eval: (
    script: string,
    keys: string[],
    args: (number | string)[]
  ) => Promise<[number, number]>;
}

let customLimiterClient: FeedRateLimiterClient | null = null;
let customLimiterResolved = false;

export function setFeedRateLimiterClientForTests(
  client: FeedRateLimiterClient | null
): void {
  customLimiterClient = client;
  customLimiterResolved = true;
}

export function extractClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstHop = forwardedFor.split(",")[0]?.trim();
    if (firstHop) {
      return normaliseIp(firstHop);
    }
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    const trimmed = realIp.trim();
    if (trimmed) {
      return normaliseIp(trimmed);
    }
  }

  return "unknown";
}

const IPV6_BRACKET_WITH_PORT_REGEX = /^\[([a-fA-F0-9:]+)\]:\d+$/;
const IPV4_WITH_PORT_REGEX = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):\d+$/;

function normaliseIp(ip: string): string {
  const bracketMatch = IPV6_BRACKET_WITH_PORT_REGEX.exec(ip);
  // biome-ignore lint/suspicious/noUnnecessaryConditions: RegExp.exec returns null for unmatched runtime input; Biome 2.5.14 incorrectly narrows this match as non-null here.
  if (bracketMatch?.[1]) {
    return bracketMatch[1].toLowerCase();
  }

  const ipv4Match = IPV4_WITH_PORT_REGEX.exec(ip);
  // biome-ignore lint/suspicious/noUnnecessaryConditions: RegExp.exec returns null for unmatched runtime input; Biome 2.5.14 incorrectly narrows this match as non-null here.
  if (ipv4Match?.[1]) {
    return ipv4Match[1];
  }

  return ip.trim().toLowerCase();
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const RATE_LIMIT_LUA_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
local ttl = redis.call('TTL', KEYS[1])
if ttl < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {current, ttl}
`;

async function executeRateLimitIncrement(
  key: string,
  windowSeconds: number
): Promise<[number, number] | null> {
  if (customLimiterResolved) {
    if (!customLimiterClient) {
      return null;
    }
    return customLimiterClient.eval(
      RATE_LIMIT_LUA_SCRIPT,
      [key],
      [windowSeconds]
    );
  }

  try {
    const { KV_REST_API_TOKEN, KV_REST_API_URL } = feedsKeys();
    if (!(KV_REST_API_URL && KV_REST_API_TOKEN)) {
      return null;
    }

    const result = await executeRedisRestCommand<unknown>({
      command: ["EVAL", RATE_LIMIT_LUA_SCRIPT, 1, key, String(windowSeconds)],
      token: KV_REST_API_TOKEN,
      url: KV_REST_API_URL,
    });

    if (!result.ok) {
      log.warn("Feed rate limiter Redis transport error, failing open", {
        code: result.error.code,
        message: result.error.message,
      });
      return null;
    }

    if (
      Array.isArray(result.value) &&
      result.value.length >= 2 &&
      typeof result.value[0] === "number" &&
      typeof result.value[1] === "number"
    ) {
      return [result.value[0], result.value[1]];
    }

    log.warn(
      "Feed rate limiter unexpected Redis response format, failing open"
    );
    return null;
  } catch (error) {
    log.warn("Feed rate limiter unexpected error, failing open", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function checkFeedRateLimit(input: {
  clientIp: string;
  tokenDigest: string;
}): Promise<RateLimitCheckResult> {
  const ipKey = `ratelimit:feed:ip:${input.clientIp}`;
  const tokenKey = `ratelimit:feed:token:${input.tokenDigest}`;

  // Check client IP limit (60 requests / 60 seconds)
  const ipResult = await checkDimension({
    key: ipKey,
    limit: FEED_RATE_LIMITS.CLIENT_IP.limit,
    windowSeconds: FEED_RATE_LIMITS.CLIENT_IP.windowSeconds,
  });

  if (!ipResult.allowed) {
    log.warn("Feed rate limit exceeded for client IP", {
      ip: input.clientIp,
      retryAfter: ipResult.retryAfter,
    });
    return ipResult;
  }

  // Check token probe limit (120 requests / 60 seconds)
  const tokenResult = await checkDimension({
    key: tokenKey,
    limit: FEED_RATE_LIMITS.TOKEN_PROBE.limit,
    windowSeconds: FEED_RATE_LIMITS.TOKEN_PROBE.windowSeconds,
  });

  if (!tokenResult.allowed) {
    log.warn("Feed rate limit exceeded for token probe", {
      retryAfter: tokenResult.retryAfter,
      tokenDigest: input.tokenDigest,
    });
    return tokenResult;
  }

  return {
    allowed: true,
    remaining: Math.min(
      ipResult.remaining ?? Number.POSITIVE_INFINITY,
      tokenResult.remaining ?? Number.POSITIVE_INFINITY
    ),
    resetInSeconds: Math.max(
      ipResult.resetInSeconds ?? 0,
      tokenResult.resetInSeconds ?? 0
    ),
  };
}

async function checkDimension(params: {
  key: string;
  limit: number;
  windowSeconds: number;
}): Promise<RateLimitCheckResult> {
  try {
    const incrementResult = await executeRateLimitIncrement(
      params.key,
      params.windowSeconds
    );

    if (!incrementResult) {
      // Degrade gracefully / fail-open when Redis is unavailable or unconfigured
      return { allowed: true };
    }

    const [current, ttl] = incrementResult;
    const retryAfter = ttl > 0 ? ttl : params.windowSeconds;

    if (current > params.limit) {
      return {
        allowed: false,
        retryAfter,
      };
    }

    return {
      allowed: true,
      remaining: Math.max(0, params.limit - current),
      resetInSeconds: ttl > 0 ? ttl : params.windowSeconds,
    };
  } catch (error) {
    log.warn("Feed rate limit check failed, failing open", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { allowed: true };
  }
}
