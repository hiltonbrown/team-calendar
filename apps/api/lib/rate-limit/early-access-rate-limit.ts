import { createHmac } from "node:crypto";
import { executeRedisRestCommand } from "@repo/core";
import { keys as feedsKeys } from "@repo/feeds/keys";
import { z } from "zod";

const keyDigest = (kind: string, value: string, secret: string) =>
  createHmac("sha256", secret).update(`${kind}:${value}`).digest("hex");

const RATE_SCRIPT = `
local receipt = redis.call('GET', KEYS[3])
if receipt then return {2, 0, receipt} end
local ip = redis.call('INCR', KEYS[1])
if ip == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
local email = redis.call('INCR', KEYS[2])
if email == 1 then redis.call('EXPIRE', KEYS[2], ARGV[2]) end
if ip > tonumber(ARGV[4]) or email > tonumber(ARGV[5]) then
  return {1, math.max(redis.call('TTL', KEYS[1]), redis.call('TTL', KEYS[2])), ''}
end
local reserved = redis.call('SET', KEYS[3], ARGV[6], 'EX', ARGV[3], 'NX')
if reserved then return {0, 0, ARGV[6]} end
return {2, 0, redis.call('GET', KEYS[3]) or ''}
`;

const RedisTupleSchema = z.tuple([
  z.union([z.literal(0), z.literal(1), z.literal(2)]),
  z.number().int(),
  z.string(),
]);
const ReceiptSchema = z.discriminatedUnion("state", [
  z.object({
    fingerprint: z.string().length(64),
    occurredAt: z.string().datetime(),
    state: z.literal("pending"),
  }),
  z.object({
    fingerprint: z.string().length(64),
    occurredAt: z.string().datetime(),
    reference: z.string().min(1),
    state: z.literal("delivered"),
  }),
]);

export type EarlyAccessAbuseResult =
  | { allowed: true; duplicateReference?: string; occurredAt: string }
  | { allowed: false; conflict: true }
  | { allowed: false; retryAfter: number };

export async function checkEarlyAccessApplicationAbuse(input: {
  email: string;
  fingerprint: string;
  hmacSecret: string;
  idempotencyKey: string;
  ip: string;
  occurredAt: string;
}): Promise<EarlyAccessAbuseResult> {
  const { KV_REST_API_TOKEN, KV_REST_API_URL } = feedsKeys();
  if (!(KV_REST_API_TOKEN && KV_REST_API_URL)) {
    throw new Error("Early access abuse controls are unavailable");
  }
  const keys = [
    `early-access:ip:${keyDigest("ip", input.ip, input.hmacSecret)}`,
    `early-access:email:${keyDigest("email", input.email, input.hmacSecret)}`,
    `early-access:receipt:${keyDigest("receipt", input.idempotencyKey, input.hmacSecret)}`,
  ];
  const result = await executeRedisRestCommand<[number, number, string]>({
    command: [
      "EVAL",
      RATE_SCRIPT,
      3,
      ...keys,
      "3600",
      "86400",
      "86400",
      "10",
      "3",
      JSON.stringify({
        fingerprint: input.fingerprint,
        occurredAt: input.occurredAt,
        state: "pending",
      }),
    ],
    token: KV_REST_API_TOKEN,
    url: KV_REST_API_URL,
  });
  const tuple = result.ok ? RedisTupleSchema.safeParse(result.value) : null;
  if (!tuple?.success) {
    throw new Error("Early access abuse controls are unavailable");
  }
  const [status, retryAfter, receipt] = tuple.data;
  if (status === 2) {
    const stored = ReceiptSchema.safeParse(JSON.parse(receipt));
    if (!(stored.success && stored.data.fingerprint === input.fingerprint)) {
      return { allowed: false, conflict: true };
    }
    return stored.data.state === "delivered"
      ? {
          allowed: true,
          duplicateReference: stored.data.reference,
          occurredAt: stored.data.occurredAt,
        }
      : { allowed: true, occurredAt: stored.data.occurredAt };
  }
  return status === 1
    ? { allowed: false, retryAfter: Math.max(1, retryAfter) }
    : { allowed: true, occurredAt: input.occurredAt };
}

export async function rememberEarlyAccessApplication(input: {
  hmacSecret: string;
  idempotencyKey: string;
  fingerprint: string;
  occurredAt: string;
  reference: string;
}): Promise<void> {
  const { KV_REST_API_TOKEN, KV_REST_API_URL } = feedsKeys();
  if (!(KV_REST_API_TOKEN && KV_REST_API_URL)) {
    throw new Error("Receipt store unavailable");
  }
  const key = `early-access:receipt:${keyDigest("receipt", input.idempotencyKey, input.hmacSecret)}`;
  const result = await executeRedisRestCommand({
    command: [
      "SET",
      key,
      JSON.stringify({
        fingerprint: input.fingerprint,
        occurredAt: input.occurredAt,
        reference: input.reference,
        state: "delivered",
      }),
      "EX",
      "86400",
      "XX",
    ],
    token: KV_REST_API_TOKEN,
    url: KV_REST_API_URL,
  });
  if (!(result.ok && result.value === "OK")) {
    throw new Error("Receipt store unavailable");
  }
}
