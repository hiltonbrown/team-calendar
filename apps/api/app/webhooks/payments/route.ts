import { constructEvent, resolvePlanKey } from "@repo/billing";
import {
  getFirstActiveOrganisationIdForClerkOrg,
  isStripeEventProcessed,
  recordStripeEvent,
  upsertSubscriptionFromWebhook,
} from "@repo/database";
import { inngest } from "@repo/jobs";
import { log } from "@repo/observability/log";
import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/env";

const MetadataSchema = z
  .object({ clerk_org_id: z.string().min(1).optional() })
  .nullable();
const StripeRef = z.union([z.string(), z.object({ id: z.string() })]);
const SessionSchema = z.object({
  customer: StripeRef.nullable(),
  metadata: MetadataSchema,
  subscription: StripeRef.nullable(),
});
const SubscriptionSchema = z.object({
  cancel_at_period_end: z.boolean().default(false),
  current_period_end: z.number().nullable().optional(),
  customer: StripeRef,
  ended_at: z.number().nullable().optional(),
  id: z.string(),
  items: z.object({
    data: z.array(z.object({ price: z.object({ id: z.string() }) })).min(1),
  }),
  metadata: MetadataSchema,
  status: z.string(),
});
// An invoice references its subscription either by id (the unexpanded default)
// or as the full expanded subscription object, which we mirror directly.
const InvoiceSchema = z.object({
  subscription: z.union([z.string(), SubscriptionSchema]).nullable().optional(),
});

const objectId = (value: string | { id: string } | null | undefined) =>
  typeof value === "string" ? value : (value?.id ?? null);
const dateFromSeconds = (value: number | null | undefined) =>
  value ? new Date(value * 1000) : null;

async function mirrorSubscription(
  data: z.infer<typeof SubscriptionSchema>,
  eventCreatedAt: Date
) {
  const clerkOrgId = data.metadata?.clerk_org_id;
  if (!clerkOrgId) {
    log.error("Stripe subscription event missing clerk_org_id metadata.", {
      stripeSubscriptionId: data.id,
    });
    return;
  }
  const priceId = data.items.data[0]?.price.id;
  const plan = resolvePlanKey(priceId);
  if (!plan.ok) {
    log.error("Stripe subscription event used an unknown price.", {
      priceId,
      stripeSubscriptionId: data.id,
    });
    return;
  }
  await upsertSubscriptionFromWebhook({
    cancelAtPeriodEnd: data.cancel_at_period_end,
    clerkOrgId,
    currentPeriodEnd: dateFromSeconds(data.current_period_end),
    endedAt: dateFromSeconds(data.ended_at),
    planKey: plan.value,
    status: data.status,
    stripeCustomerId: objectId(data.customer),
    stripeEventCreatedAt: eventCreatedAt,
    stripeSubscriptionId: data.id,
  });
  const organisationId =
    await getFirstActiveOrganisationIdForClerkOrg(clerkOrgId);
  if (!organisationId) {
    log.error(
      "Stripe subscription mirror skipped recount-usage because no active organisation was found.",
      {
        clerkOrgId,
        stripeSubscriptionId: data.id,
      }
    );
    return;
  }
  await inngest.send({
    name: "recount-usage",
    data: {
      clerkOrgId,
      organisationId,
    },
  });
}

const SUBSCRIPTION_EVENT_TYPES = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);
const INVOICE_EVENT_TYPES = new Set(["invoice.payment_failed", "invoice.paid"]);

// Only the fields these handlers read; avoids importing the Stripe SDK type
// into a route that otherwise depends on it only via @repo/billing.
interface StripeEventLike {
  created: number;
  data: { object: unknown };
  id: string;
  type: string;
}

async function handleSubscriptionEvent(event: StripeEventLike) {
  const parsed = SubscriptionSchema.safeParse(event.data.object);
  if (parsed.success) {
    await mirrorSubscription(
      parsed.data,
      dateFromSeconds(event.created) ?? new Date()
    );
    return;
  }
  log.error("Stripe subscription event failed validation and was skipped.", {
    eventId: event.id,
    eventType: event.type,
    issues: parsed.error.issues,
  });
}

async function handleInvoiceEvent(event: StripeEventLike) {
  const parsed = InvoiceSchema.safeParse(event.data.object);
  if (!parsed.success) {
    log.error("Stripe invoice event failed validation and was skipped.", {
      eventId: event.id,
      eventType: event.type,
      issues: parsed.error.issues,
    });
    return;
  }
  const subscription = parsed.data.subscription;
  if (subscription && typeof subscription !== "string") {
    await mirrorSubscription(
      subscription,
      dateFromSeconds(event.created) ?? new Date()
    );
  } else if (subscription) {
    log.info(
      "Stripe invoice event carried no expanded subscription and was skipped.",
      { eventId: event.id, eventType: event.type }
    );
  }
}

function checkCheckoutSessionMetadata(event: StripeEventLike) {
  const parsed = SessionSchema.safeParse(event.data.object);
  if (parsed.success && !parsed.data.metadata?.clerk_org_id) {
    log.warn("Stripe checkout session missing clerk_org_id metadata.");
  }
}

async function processStripeEvent(event: StripeEventLike) {
  if (event.type === "checkout.session.completed") {
    checkCheckoutSessionMetadata(event);
  } else if (SUBSCRIPTION_EVENT_TYPES.has(event.type)) {
    await handleSubscriptionEvent(event);
  } else if (INVOICE_EVENT_TYPES.has(event.type)) {
    await handleInvoiceEvent(event);
  } else {
    log.info("Stripe event type not handled.", {
      eventId: event.id,
      eventType: event.type,
    });
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const eventResult = constructEvent(
    rawBody,
    request.headers.get("stripe-signature"),
    env.STRIPE_WEBHOOK_SECRET
  );
  if (!eventResult.ok) {
    return NextResponse.json(
      { error: eventResult.error.message },
      { status: 400 }
    );
  }
  const event = eventResult.value;
  // Skip events we have already mirrored. We only record the event after
  // processing succeeds (below), so a failure leaves no row and Stripe's retry
  // reprocesses it. Mirror writes are idempotent, so a duplicate is harmless.
  if (await isStripeEventProcessed(event.id)) {
    return NextResponse.json({ received: true });
  }

  await processStripeEvent(event);

  await recordStripeEvent(event.id, event.type);
  return NextResponse.json({ received: true });
}
