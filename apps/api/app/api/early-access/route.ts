import { createHmac } from "node:crypto";
import { createActivationEvent } from "@repo/analytics/activation-events";
import { analytics } from "@repo/analytics/server";
import { sendEarlyAccessApplication } from "@repo/email";
import { log } from "@repo/observability/log";
import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/env";
import {
  checkEarlyAccessApplicationAbuse,
  type EarlyAccessAbuseResult,
  rememberEarlyAccessApplication,
} from "@/lib/rate-limit/early-access-rate-limit";

const ApplicationSchema = z
  .object({
    calendarClient: z.enum(["google", "microsoft", "apple", "other"]),
    companySize: z.enum(["1-7", "8-30", "31-75", "76+"]),
    country: z.literal("AU"),
    currentProcess: z.string().trim().min(10).max(1000),
    email: z.string().trim().email().max(254),
    heardFrom: z.string().trim().min(2).max(200),
    usesXeroPayroll: z.literal("yes"),
  })
  .strict();

const corsHeaders = (origin: string) => ({
  "Access-Control-Allow-Headers": "content-type,idempotency-key",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Origin": origin,
  Vary: "Origin",
});

const allowedOrigin = () => env.NEXT_PUBLIC_WEB_URL;

const applicationIdentity = (
  application: z.infer<typeof ApplicationSchema>,
  idempotencyKey: string,
  secret: string
) => {
  const fingerprint = createHmac("sha256", secret)
    .update(JSON.stringify(application))
    .digest("hex");
  const reference = createHmac("sha256", secret)
    .update(`application:${idempotencyKey}:${fingerprint}`)
    .digest("hex")
    .slice(0, 8)
    .toUpperCase();
  return { fingerprint, reference: `EA-${reference}` };
};

export function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== allowedOrigin()) {
    return new Response(null, { status: 403 });
  }
  return new Response(null, { headers: corsHeaders(origin), status: 204 });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== allowedOrigin()) {
    return NextResponse.json(
      { error: "Origin is not allowed" },
      { status: 403 }
    );
  }
  const headers = corsHeaders(origin);
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  ) {
    return NextResponse.json(
      { error: "Content-Type must be application/json" },
      { headers, status: 415 }
    );
  }
  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey || idempotencyKey.length > 200) {
    return NextResponse.json(
      { error: "A valid idempotency key is required" },
      { headers, status: 400 }
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { headers, status: 400 }
    );
  }
  const parsed = ApplicationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Application details are invalid" },
      { headers, status: 400 }
    );
  }
  const recipient = env.EARLY_ACCESS_APPLICATION_RECIPIENT;
  const hmacSecret = env.EARLY_ACCESS_APPLICATION_HMAC_SECRET;
  if (!(recipient && hmacSecret)) {
    return NextResponse.json(
      { error: "Applications are temporarily unavailable" },
      { headers, status: 503 }
    );
  }
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const identity = applicationIdentity(parsed.data, idempotencyKey, hmacSecret);
  let abuse: EarlyAccessAbuseResult;
  try {
    abuse = await checkEarlyAccessApplicationAbuse({
      email: parsed.data.email.toLowerCase(),
      fingerprint: identity.fingerprint,
      hmacSecret,
      idempotencyKey,
      ip,
      occurredAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      { error: "Applications are temporarily unavailable" },
      { headers, status: 503 }
    );
  }
  if (!abuse.allowed) {
    if ("conflict" in abuse) {
      return NextResponse.json(
        {
          error:
            "The idempotency key was already used for another application.",
        },
        { headers, status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Too many applications. Please try again later." },
      {
        headers: { ...headers, "Retry-After": String(abuse.retryAfter) },
        status: 429,
      }
    );
  }
  if (abuse.duplicateReference) {
    return NextResponse.json(
      { reference: abuse.duplicateReference },
      { headers, status: 200 }
    );
  }
  const { reference } = identity;
  const delivery = await sendEarlyAccessApplication({
    application: { ...parsed.data, reference },
    idempotencyKey: `early-access:${idempotencyKey}`,
    to: recipient,
  });
  if (!delivery.ok) {
    log.error("Early access application delivery failed", {
      errorCategory: "provider_delivery",
    });
    return NextResponse.json(
      { error: "We could not submit your application. Please try again." },
      { headers, status: 503 }
    );
  }
  try {
    await rememberEarlyAccessApplication({
      fingerprint: identity.fingerprint,
      hmacSecret,
      idempotencyKey,
      occurredAt: abuse.occurredAt,
      reference,
    });
  } catch {
    log.error("Early access application receipt persistence failed", {
      errorCategory: "receipt_store",
    });
    return NextResponse.json(
      { error: "We could not confirm your application. Please retry." },
      { headers, status: 503 }
    );
  }
  const event = createActivationEvent({
    deduplicationKey: delivery.value.id,
    name: "Application Accepted",
    occurredAt: abuse.occurredAt,
    subjectId: reference,
  });
  analytics?.capture({
    distinctId: event.distinctId,
    event: event.event,
    properties: event.properties,
    timestamp: event.timestamp,
    uuid: event.uuid,
  });
  await analytics?.flush();
  return NextResponse.json({ reference }, { headers, status: 202 });
}
