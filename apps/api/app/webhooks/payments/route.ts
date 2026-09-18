import {
  constructEvent,
  resolvePlanKey,
  retrieveStripeSubscription,
} from "@repo/billing";
import {
  getFirstActiveOrganisationIdForClerkOrg,
  getSubscriptionForOrg,
  getSubscriptionForStripeCustomer,
  getSubscriptionForStripeSubscription,
  isStripeEventProcessed,
  recordStripeEvent,
  recordStripeEventFailure,
  recordStripeEventIgnored,
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
  parent: z
    .object({
      subscription_details: z
        .object({ subscription: StripeRef.nullable().optional() })
        .nullable()
        .optional(),
    })
    .nullable()
    .optional(),
  subscription: z.union([SubscriptionSchema, z.string()]).nullable().optional(),
});

const objectId = (value: string | { id: string } | null | undefined) =>
  typeof value === "string" ? value : (value?.id ?? null);
const dateFromSeconds = (value: number | null | undefined) =>
  value ? new Date(value * 1000) : null;

interface EventIdentity {
  clerkOrgId?: string;
  conflict: boolean;
  stripeCustomerId?: string | null;
}

async function resolveEventIdentity(
  value: unknown,
  subscriptionId?: string | null
): Promise<EventIdentity> {
  const loose = z
    .object({
      customer: StripeRef.nullable().optional(),
      metadata: MetadataSchema.optional(),
    })
    .safeParse(value);
  const stripeCustomerId = loose.success ? objectId(loose.data.customer) : null;
  const metadataOrgId = loose.success
    ? loose.data.metadata?.clerk_org_id
    : undefined;
  const [customerBinding, subscriptionBinding] = await Promise.all([
    stripeCustomerId
      ? getSubscriptionForStripeCustomer(stripeCustomerId)
      : Promise.resolve(null),
    subscriptionId
      ? getSubscriptionForStripeSubscription(subscriptionId)
      : Promise.resolve(null),
  ]);
  const binding = customerBinding ?? subscriptionBinding;
  if (binding) {
    return {
      clerkOrgId: binding.clerk_org_id,
      conflict: Boolean(
        metadataOrgId && metadataOrgId !== binding.clerk_org_id
      ),
      stripeCustomerId: binding.stripe_customer_id ?? stripeCustomerId,
    };
  }
  if (!metadataOrgId) {
    return { conflict: false, stripeCustomerId };
  }
  const orgBinding = await getSubscriptionForOrg(metadataOrgId);
  const conflict = Boolean(
    orgBinding?.stripe_customer_id &&
      stripeCustomerId &&
      orgBinding.stripe_customer_id !== stripeCustomerId
  );
  return {
    clerkOrgId: conflict ? undefined : metadataOrgId,
    conflict,
    stripeCustomerId,
  };
}

export interface MirrorResult {
  clerkOrgId?: string;
  disposition?: "ignored" | "processed";
  error?: string;
  errorCategory?: string;
  ok: boolean;
  status?: number;
  stripeCustomerId?: string | null;
}

async function mirrorSubscription(
  data: z.infer<typeof SubscriptionSchema>,
  eventCreatedAt: Date
): Promise<MirrorResult> {
  const identity = await resolveEventIdentity(data, data.id);
  const { clerkOrgId } = identity;
  const metadataOrgId = data.metadata?.clerk_org_id;
  if (identity.conflict) {
    log.error("Stripe subscription tenant cross-check conflict detected.", {
      metadataOrgId: metadataOrgId ?? null,
      resolvedClerkOrgId: clerkOrgId ?? null,
      stripeCustomerId: identity.stripeCustomerId ?? null,
      stripeSubscriptionId: data.id,
    });
    return {
      clerkOrgId,
      error: "Stripe customer and organisation identity conflict",
      errorCategory: "tenant_conflict",
      ok: false,
      status: 503,
      stripeCustomerId: identity.stripeCustomerId,
    };
  }
  if (!clerkOrgId) {
    log.error(
      "Stripe subscription event missing trusted organisation identity.",
      { stripeSubscriptionId: data.id }
    );
    return {
      error: "Billing subscription metadata is incomplete",
      errorCategory: "invalid_payload",
      ok: false,
      status: 503,
      stripeCustomerId: identity.stripeCustomerId,
    };
  }
  const priceId = data.items.data[0]?.price.id;
  const plan = resolvePlanKey(priceId);
  if (!plan.ok) {
    log.error("Stripe subscription event used an unknown price.", {
      priceId,
      stripeSubscriptionId: data.id,
    });
    return {
      clerkOrgId,
      error: "Billing price is not recognised",
      errorCategory: "unknown_price",
      ok: false,
      status: 503,
      stripeCustomerId: identity.stripeCustomerId,
    };
  }
  const stripeCustomerId = identity.stripeCustomerId ?? objectId(data.customer);
  await upsertSubscriptionFromWebhook({
    cancelAtPeriodEnd: data.cancel_at_period_end,
    clerkOrgId,
    currentPeriodEnd: dateFromSeconds(data.current_period_end),
    endedAt: dateFromSeconds(data.ended_at),
    planKey: plan.value,
    status: data.status,
    stripeCustomerId,
    stripeEventCreatedAt: eventCreatedAt,
    stripeSubscriptionId: data.id,
  });
  const organisationId =
    await getFirstActiveOrganisationIdForClerkOrg(clerkOrgId);
  if (!organisationId) {
    log.error(
      "Stripe subscription mirror skipped recount-usage because no active organisation was found.",
      { clerkOrgId, stripeSubscriptionId: data.id }
    );
    return { clerkOrgId, disposition: "processed", ok: true, stripeCustomerId };
  }
  await inngest.send({
    data: { clerkOrgId, organisationId },
    name: "recount-usage",
  });
  return { clerkOrgId, disposition: "processed", ok: true, stripeCustomerId };
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

async function handleSubscriptionEvent(
  event: StripeEventLike
): Promise<MirrorResult> {
  const parsed = SubscriptionSchema.safeParse(event.data.object);
  if (parsed.success) {
    return await mirrorSubscription(
      parsed.data,
      dateFromSeconds(event.created) ?? new Date()
    );
  }
  log.error("Stripe subscription event failed validation and was skipped.", {
    eventId: event.id,
    eventType: event.type,
    issues: parsed.error.issues,
  });
  const identity = await resolveEventIdentity(event.data.object);
  return {
    clerkOrgId: identity.clerkOrgId,
    error: "Stripe subscription payload is invalid",
    errorCategory: "invalid_payload",
    ok: false,
    status: 503,
    stripeCustomerId: identity.stripeCustomerId,
  };
}

async function handleInvoiceEvent(
  event: StripeEventLike
): Promise<MirrorResult> {
  const parsed = InvoiceSchema.safeParse(event.data.object);
  if (!parsed.success) {
    log.error("Stripe invoice event failed validation and was skipped.", {
      eventId: event.id,
      eventType: event.type,
      issues: parsed.error.issues,
    });
    return {
      error: "Stripe invoice payload is invalid",
      errorCategory: "invalid_payload",
      ok: false,
      status: 503,
    };
  }
  const subscription =
    parsed.data.subscription ??
    parsed.data.parent?.subscription_details?.subscription;
  if (subscription && typeof subscription !== "string") {
    const expanded = SubscriptionSchema.safeParse(subscription);
    if (expanded.success) {
      return await mirrorSubscription(
        expanded.data,
        dateFromSeconds(event.created) ?? new Date()
      );
    }
  }
  const subscriptionId = objectId(subscription);
  if (subscriptionId) {
    const retrieved = await retrieveStripeSubscription(subscriptionId);
    if (!retrieved.ok) {
      const identity = await resolveEventIdentity(
        event.data.object,
        subscriptionId
      );
      return {
        clerkOrgId: identity.clerkOrgId,
        error: "Stripe subscription retrieval failed",
        errorCategory: "provider_fetch",
        ok: false,
        status: 503,
        stripeCustomerId: identity.stripeCustomerId,
      };
    }
    const authoritative = SubscriptionSchema.safeParse(retrieved.value);
    if (!authoritative.success) {
      return {
        error: "Stripe subscription payload is invalid",
        errorCategory: "invalid_payload",
        ok: false,
        status: 503,
      };
    }
    return await mirrorSubscription(
      authoritative.data,
      dateFromSeconds(event.created) ?? new Date()
    );
  }
  return { disposition: "ignored", ok: true };
}

async function handleCheckoutSession(
  event: StripeEventLike
): Promise<MirrorResult> {
  const parsed = SessionSchema.safeParse(event.data.object);
  if (!parsed.success) {
    return {
      error: "Stripe checkout payload is invalid",
      errorCategory: "invalid_payload",
      ok: false,
      status: 503,
    };
  }
  const subscriptionId = objectId(parsed.data.subscription);
  if (!subscriptionId) {
    return { disposition: "ignored", ok: true };
  }
  const retrieved = await retrieveStripeSubscription(subscriptionId);
  if (!retrieved.ok) {
    const identity = await resolveEventIdentity(
      event.data.object,
      subscriptionId
    );
    return {
      clerkOrgId: identity.clerkOrgId,
      error: "Stripe subscription retrieval failed",
      errorCategory: "provider_fetch",
      ok: false,
      status: 503,
      stripeCustomerId: identity.stripeCustomerId,
    };
  }
  const authoritative = SubscriptionSchema.safeParse(retrieved.value);
  return authoritative.success
    ? mirrorSubscription(
        authoritative.data,
        dateFromSeconds(event.created) ?? new Date()
      )
    : {
        error: "Stripe subscription payload is invalid",
        errorCategory: "invalid_payload",
        ok: false,
        status: 503,
      };
}

export async function processStripeEvent(
  event: StripeEventLike
): Promise<MirrorResult> {
  if (event.type === "checkout.session.completed") {
    return await handleCheckoutSession(event);
  }
  if (SUBSCRIPTION_EVENT_TYPES.has(event.type)) {
    return await handleSubscriptionEvent(event);
  }
  if (INVOICE_EVENT_TYPES.has(event.type)) {
    return await handleInvoiceEvent(event);
  }
  log.info("Stripe event type not handled.", {
    eventId: event.id,
    eventType: event.type,
  });
  return { disposition: "ignored", ok: true };
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
      { status: eventResult.error.code === "internal" ? 503 : 400 }
    );
  }
  const event = eventResult.value;
  // Skip events we have already mirrored. We only record the event after
  // processing succeeds (below), so a failure leaves no row and Stripe's retry
  // reprocesses it. Mirror writes are idempotent, so a duplicate is harmless.
  if (await isStripeEventProcessed(event.id)) {
    return NextResponse.json({ received: true });
  }

  let result: MirrorResult;
  try {
    result = await processStripeEvent(event);
  } catch {
    log.error("Stripe event processing raised an unexpected error.", {
      eventId: event.id,
      eventType: event.type,
    });
    await recordStripeEventFailure({
      clerkOrgId: null,
      errorCategory: "processing_exception",
      eventCreatedAt: dateFromSeconds(event.created),
      eventId: event.id,
      stripeCustomerId: null,
      type: event.type,
    });
    return NextResponse.json(
      { error: "Billing event processing failed" },
      { status: 503 }
    );
  }
  if (!result.ok) {
    await recordStripeEventFailure({
      clerkOrgId: result.clerkOrgId ?? null,
      errorCategory: result.errorCategory ?? "processing_failure",
      eventCreatedAt: dateFromSeconds(event.created),
      eventId: event.id,
      stripeCustomerId: result.stripeCustomerId ?? null,
      type: event.type,
    });
    return NextResponse.json(
      { error: "Billing event processing failed" },
      { status: result.status ?? 503 }
    );
  }

  if (result.disposition === "ignored") {
    await recordStripeEventIgnored(
      event.id,
      event.type,
      dateFromSeconds(event.created)
    );
  } else {
    await recordStripeEvent(event.id, event.type, {
      clerkOrgId: result.clerkOrgId ?? null,
      eventCreatedAt: dateFromSeconds(event.created),
      stripeCustomerId: result.stripeCustomerId ?? null,
    });
  }
  return NextResponse.json({ received: true });
}
