import {
  database,
  type UpsertSubscriptionInput,
  upsertSubscriptionFromWebhook,
} from "@repo/database";
import { dispatchRecountUsage } from "@repo/jobs";
import { log } from "@repo/observability/log";
import { headers } from "next/headers";
import { Webhook } from "svix";
import { z } from "zod";
import { env } from "@/env";

// Clerk Billing webhook. Clerk owns subscription state; this endpoint is the
// only writer of the clerk_org_subscriptions mirror. It verifies the Svix
// signature, validates the payload, upserts the mirror, enqueues a usage
// recount, and returns fast.
//
// Field paths below follow Clerk's billing event shape (payer.organization_id,
// items[].plan.slug, period_end as unix seconds). Confirm against the sample
// payloads in the Clerk Dashboard before going live; the Zod schema rejects
// anything that does not match so a shape change fails loudly rather than
// writing bad state.

const PlanRefSchema = z.object({ slug: z.string().min(1) });
const PayerSchema = z.object({ organization_id: z.string().min(1) });
const IntervalSchema = z.enum(["month", "year"]);

const SubscriptionItemShape = z.object({
  cancel_at_period_end: z.boolean().nullish(),
  period_end: z.number().int().nullish(),
  plan: PlanRefSchema,
  plan_period: IntervalSchema.nullish(),
  status: z.string().min(1),
});

const SubscriptionDataSchema = z.object({
  items: z.array(SubscriptionItemShape).min(1),
  payer: PayerSchema,
  status: z.string().min(1),
});

const SubscriptionItemDataSchema = SubscriptionItemShape.extend({
  payer: PayerSchema,
});

const BillingWebhookEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("subscription.created"),
    data: SubscriptionDataSchema,
  }),
  z.object({
    type: z.literal("subscription.updated"),
    data: SubscriptionDataSchema,
  }),
  z.object({
    type: z.literal("subscription.active"),
    data: SubscriptionDataSchema,
  }),
  z.object({
    type: z.literal("subscription.past_due"),
    data: SubscriptionDataSchema,
  }),
  z.object({
    type: z.literal("subscription.deleted"),
    data: SubscriptionDataSchema,
  }),
  z.object({
    type: z.literal("subscriptionItem.created"),
    data: SubscriptionItemDataSchema,
  }),
  z.object({
    type: z.literal("subscriptionItem.updated"),
    data: SubscriptionItemDataSchema,
  }),
  z.object({
    type: z.literal("subscriptionItem.active"),
    data: SubscriptionItemDataSchema,
  }),
  z.object({
    type: z.literal("subscriptionItem.canceled"),
    data: SubscriptionItemDataSchema,
  }),
]);

type BillingWebhookEvent = z.infer<typeof BillingWebhookEventSchema>;

const toPeriodEnd = (seconds: number | null | undefined): Date | null =>
  typeof seconds === "number" ? new Date(seconds * 1000) : null;

const isCancellation = (eventType: string): boolean =>
  eventType === "subscription.deleted" ||
  eventType === "subscriptionItem.canceled";

// Reduces a verified event to the subscription mirror shape. Returns null when
// the event carries no usable subscription item.
export function mapBillingEvent(
  event: BillingWebhookEvent
): UpsertSubscriptionInput | null {
  const cancelled = isCancellation(event.type);

  if ("items" in event.data) {
    const item =
      event.data.items.find((candidate) => candidate.status === "active") ??
      event.data.items[0];
    if (!item) {
      return null;
    }
    return {
      billingInterval: item.plan_period ?? null,
      cancelAtPeriodEnd: cancelled || (item.cancel_at_period_end ?? false),
      clerkOrgId: event.data.payer.organization_id,
      clerkPlanKey: item.plan.slug,
      currentPeriodEnd: toPeriodEnd(item.period_end),
      status: cancelled ? "canceled" : event.data.status,
    };
  }

  return {
    billingInterval: event.data.plan_period ?? null,
    cancelAtPeriodEnd: cancelled || (event.data.cancel_at_period_end ?? false),
    clerkOrgId: event.data.payer.organization_id,
    clerkPlanKey: event.data.plan.slug,
    currentPeriodEnd: toPeriodEnd(event.data.period_end),
    status: cancelled ? "canceled" : event.data.status,
  };
}

export const POST = async (request: Request): Promise<Response> => {
  if (!env.CLERK_BILLING_WEBHOOK_SECRET) {
    return new Response("Not configured", { status: 200 });
  }

  const headerPayload = await headers();
  const svixId = headerPayload.get("svix-id");
  const svixTimestamp = headerPayload.get("svix-timestamp");
  const svixSignature = headerPayload.get("svix-signature");

  if (!(svixId && svixTimestamp && svixSignature)) {
    return new Response("Missing svix headers", { status: 400 });
  }

  const body = await request.text();
  const webhook = new Webhook(env.CLERK_BILLING_WEBHOOK_SECRET);

  let verified: unknown;
  try {
    verified = webhook.verify(body, {
      "svix-id": svixId,
      "svix-signature": svixSignature,
      "svix-timestamp": svixTimestamp,
    });
  } catch (error) {
    log.error("Error verifying billing webhook:", { error });
    return new Response("Invalid signature", { status: 400 });
  }

  const parsed = BillingWebhookEventSchema.safeParse(verified);
  if (!parsed.success) {
    log.error("Invalid billing webhook payload", {
      issues: parsed.error.issues,
    });
    return new Response("Invalid webhook payload", { status: 400 });
  }

  const mapped = mapBillingEvent(parsed.data);
  if (!mapped) {
    return new Response("Ignored", { status: 200 });
  }

  const result = await upsertSubscriptionFromWebhook(mapped);
  if (!result.ok) {
    log.error("Failed to mirror billing subscription", {
      clerkOrgId: mapped.clerkOrgId,
      error: result.error,
    });
    return new Response("Subscription not recorded", { status: 200 });
  }

  await enqueueRecount(mapped.clerkOrgId);

  return new Response("OK", { status: 200 });
};

async function enqueueRecount(clerkOrgId: string): Promise<void> {
  const organisation = await database.organisation.findFirst({
    select: { id: true },
    where: { archived_at: null, clerk_org_id: clerkOrgId },
  });
  if (!organisation) {
    return;
  }

  const dispatched = await dispatchRecountUsage({
    clerkOrgId,
    organisationId: organisation.id,
  });
  if (!dispatched.ok) {
    log.error("Failed to enqueue usage recount", {
      clerkOrgId,
      error: dispatched.error,
    });
  }
}
