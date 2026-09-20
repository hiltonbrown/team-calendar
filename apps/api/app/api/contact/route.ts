import { createHmac } from "node:crypto";
import { createActivationEvent } from "@repo/analytics/activation-events";
import { analytics } from "@repo/analytics/server";
import { type ContactMessage, sendContactEmail } from "@repo/email";
import { log } from "@repo/observability/log";
import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/env";
import {
  checkEarlyAccessApplicationAbuse,
  rememberEarlyAccessApplication,
} from "@/lib/rate-limit/early-access-rate-limit";

const idempotencyKeyPattern = /^[A-Za-z0-9_-]{1,128}$/;

const base = {
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  message: z.string().trim().min(10).max(5000),
  name: z.string().trim().min(2).max(100),
  organisation: z.string().trim().max(200).optional(),
  sendConfirmation: z.boolean(),
};
const ContactSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("enquiry") }).strict(),
  z.object({ ...base, type: z.literal("support") }).strict(),
  z
    .object({
      ...base,
      browser: z.string().trim().max(200).optional(),
      pageUrl: z
        .union([
          z.literal(""),
          z
            .url()
            .max(2000)
            .refine((value) => {
              if (!URL.canParse(value)) {
                return false;
              }
              const { protocol } = new URL(value);
              return protocol === "https:" || protocol === "http:";
            }),
        ])
        .optional(),
      steps: z.string().trim().max(5000).optional(),
      type: z.literal("bug"),
    })
    .strict(),
  z
    .object({
      ...base,
      calendarClient: z.enum(["google", "microsoft", "apple", "other"]),
      companySize: z.enum(["1-7", "8-30", "31-75", "76+"]),
      country: z.literal("AU"),
      heardFrom: z.string().trim().min(2).max(200),
      type: z.literal("early-access"),
      usesXeroPayroll: z.literal("yes"),
    })
    .strict(),
]);
const corsHeaders = (origin: string) => ({
  "Access-Control-Allow-Headers": "content-type,idempotency-key",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Origin": origin,
  Vary: "Origin",
});

export function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  return origin === env.NEXT_PUBLIC_WEB_URL && origin
    ? new Response(null, { headers: corsHeaders(origin), status: 204 })
    : new Response(null, { status: 403 });
}

async function sendConfirmationReceipt(
  message: ContactMessage,
  reference: string,
  idempotencyKey: string
): Promise<"sent" | "failed"> {
  // Resend deduplicates confirmations independently, so retries can recover
  // failed confirmations without duplicating accepted messages.
  try {
    const receipt = await sendContactEmail({
      confirmation: true,
      idempotencyKey: `${idempotencyKey}:confirmation`,
      message,
      reference,
      to: message.email,
    });
    return receipt.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}

async function recordApplicationAccepted(
  type: ContactMessage["type"],
  reference: string,
  emailId: string,
  occurredAt: string
) {
  if (type !== "early-access") {
    return;
  }
  try {
    const event = createActivationEvent({
      deduplicationKey: emailId,
      name: "Application Accepted",
      occurredAt,
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
  } catch {
    log.error("Contact application analytics unavailable", {
      errorCategory: "analytics",
    });
  }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== env.NEXT_PUBLIC_WEB_URL) {
    return NextResponse.json(
      { error: "Origin is not allowed" },
      { status: 403 }
    );
  }
  const headers = corsHeaders(origin);
  const fail = (error: string, status: number) =>
    NextResponse.json({ error }, { headers, status });
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  ) {
    return fail("Content-Type must be application/json", 415);
  }
  const key = request.headers.get("idempotency-key");
  if (!(key && idempotencyKeyPattern.test(key))) {
    return fail("A valid idempotency key is required", 400);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("Invalid JSON", 400);
  }
  const parsed = ContactSchema.safeParse(body);
  if (!parsed.success) {
    return fail("Please check your contact details and message.", 400);
  }
  const recipient = env.EARLY_ACCESS_APPLICATION_RECIPIENT;
  const hmacSecret = env.EARLY_ACCESS_APPLICATION_HMAC_SECRET;
  if (!(recipient && hmacSecret)) {
    return fail(
      "Contact submissions are temporarily unavailable. Please try again later.",
      503
    );
  }
  const fingerprint = createHmac("sha256", hmacSecret)
    .update(JSON.stringify(parsed.data))
    .digest("hex");
  const idempotencyKey = `contact:${key}`;
  const reference = `TC-${createHmac("sha256", hmacSecret).update(`${idempotencyKey}:${fingerprint}`).digest("hex").slice(0, 12).toUpperCase()}`;
  try {
    const abuse = await checkEarlyAccessApplicationAbuse({
      email: parsed.data.email,
      fingerprint,
      hmacSecret,
      idempotencyKey,
      ip:
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        "unknown",
      occurredAt: new Date().toISOString(),
    });
    if (!abuse.allowed) {
      if ("conflict" in abuse) {
        return fail(
          "This submission key was already used for a different message.",
          409
        );
      }
      return NextResponse.json(
        { error: "Too many messages. Please try again later." },
        {
          headers: { ...headers, "Retry-After": String(abuse.retryAfter) },
          status: 429,
        }
      );
    }
    const { sendConfirmation, ...message } = parsed.data;
    const acceptedReference = abuse.duplicateReference ?? reference;
    if (!abuse.duplicateReference) {
      const delivery = await sendContactEmail({
        idempotencyKey: `${idempotencyKey}:team`,
        message,
        reference,
        to: recipient,
      });
      if (!delivery.ok) {
        return fail("We could not send your message. Please try again.", 503);
      }
      await rememberEarlyAccessApplication({
        fingerprint,
        hmacSecret,
        idempotencyKey,
        occurredAt: abuse.occurredAt,
        reference,
      });
      await recordApplicationAccepted(
        message.type,
        reference,
        delivery.value.id,
        abuse.occurredAt
      );
    }
    const confirmation = sendConfirmation
      ? await sendConfirmationReceipt(
          message,
          acceptedReference,
          idempotencyKey
        )
      : "not-requested";
    return NextResponse.json(
      { confirmation, reference: acceptedReference },
      {
        headers,
        status: abuse.duplicateReference ? 200 : 202,
      }
    );
  } catch {
    log.error("Contact submission could not be confirmed", {
      errorCategory: "contact_delivery",
    });
    return fail(
      "We could not confirm your submission. Please retry with the same message.",
      503
    );
  }
}
