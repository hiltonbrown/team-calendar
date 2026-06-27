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
// Field shapes follow Clerk's BillingSubscription(Item)WebhookEventJSON
// (@clerk/backend): payer.organization_id, items[].plan.slug, plan_period of
// "month" | "annual" (mapped to the month | year DB enum), and period_end as a
// Unix timestamp in MILLISECONDS. Cancellation is derived from the subscription
// status and canceled_at, since Clerk does not emit a discrete deleted event.

const SUBSCRIPTION_EVENT_TYPES = new Set([
  "subscription.created",
  "subscription.updated",
  "subscription.active",
  "subscription.pastDue",
]);

const ITEM_EVENT_TYPES = new Set([
  "subscriptionItem.created",
  "subscriptionItem.updated",
  "subscriptionItem.active",
  "subscriptionItem.canceled",
  "subscriptionItem.pastDue",
  "subscriptionItem.ended",
]);

const PlanRefSchema = z.object({ slug: z.string().min(1) });
const PayerSchema = z.object({ organization_id: z.string().min(1).optional() });
const PlanPeriodSchema = z.enum(["month", "annual"]);

const SubscriptionItemShape = z.object({
  canceled_at: z.number().int().nullish(),
  period_end: z.number().int().nullish(),
  plan: PlanRefSchema.nullish(),
  plan_period: PlanPeriodSchema.nullish(),
  status: z.string().min(1),
});

const SubscriptionDataSchema = z.object({
  canceled_at: z.number().int().nullish(),
  items: z.array(SubscriptionItemShape).min(1),
  payer: PayerSchema,
  status: z.string().min(1),
});

const SubscriptionItemDataSchema = SubscriptionItemShape.extend({
  payer: PayerSchema.nullish(),
});

const EnvelopeSchema = z.object({ data: z.unknown(), type: z.string() });

// Clerk period timestamps are Unix milliseconds.
const toPeriodEnd = (ms: number | null | undefined): Date | null =>
  typeof ms === "number" ? new Date(ms) : null;

// Clerk reports "month" | "annual"; the DB enum is month | year.
const toBillingInterval = (
  period: "month" | "annual" | null | undefined
): "month" | "year" | null => {
  if (period === "annual") {
    return "year";
  }
  if (period === "month") {
    return "month";
  }
  return null;
};

const isCancelled = (
  status: string,
  canceledAt: number | null | undefined
): boolean => status === "canceled" || status === "ended" || canceledAt != null;

export function mapSubscriptionEvent(
  data: z.infer<typeof SubscriptionDataSchema>
): UpsertSubscriptionInput | null {
  const organizationId = data.payer.organization_id;
  if (!organizationId) {
    return null;
  }
  const item =
    data.items.find((candidate) => candidate.status === "active") ??
    data.items[0];
  if (!item?.plan?.slug) {
    return null;
  }
  return {
    billingInterval: toBillingInterval(item.plan_period),
    cancelAtPeriodEnd: isCancelled(
      data.status,
      data.canceled_at ?? item.canceled_at
    ),
    clerkOrgId: organizationId,
    clerkPlanKey: item.plan.slug,
    currentPeriodEnd: toPeriodEnd(item.period_end),
    status: data.status,
  };
}

export function mapSubscriptionItemEvent(
  data: z.infer<typeof SubscriptionItemDataSchema>
): UpsertSubscriptionInput | null {
  const organizationId = data.payer?.organization_id;
  if (!(organizationId && data.plan?.slug)) {
    return null;
  }
  return {
    billingInterval: toBillingInterval(data.plan_period),
    cancelAtPeriodEnd: isCancelled(data.status, data.canceled_at),
    clerkOrgId: organizationId,
    clerkPlanKey: data.plan.slug,
    currentPeriodEnd: toPeriodEnd(data.period_end),
    status: data.status,
  };
}

// Parses and maps a verified event. Returns the mirror shape, or null when the
// event type is not one we mirror or it carries no organisation-scoped item.
// Throws a typed marker for malformed payloads of handled types so the caller
// can answer 400.
class MalformedPayloadError extends Error {}

function mapEvent(type: string, data: unknown): UpsertSubscriptionInput | null {
  if (SUBSCRIPTION_EVENT_TYPES.has(type)) {
    const parsed = SubscriptionDataSchema.safeParse(data);
    if (!parsed.success) {
      throw new MalformedPayloadError();
    }
    return mapSubscriptionEvent(parsed.data);
  }
  if (ITEM_EVENT_TYPES.has(type)) {
    const parsed = SubscriptionItemDataSchema.safeParse(data);
    if (!parsed.success) {
      throw new MalformedPayloadError();
    }
    return mapSubscriptionItemEvent(parsed.data);
  }
  return null;
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

  const envelope = EnvelopeSchema.safeParse(verified);
  if (!envelope.success) {
    return new Response("Invalid webhook payload", { status: 400 });
  }

  let mapped: UpsertSubscriptionInput | null;
  try {
    mapped = mapEvent(envelope.data.type, envelope.data.data);
  } catch {
    log.error("Invalid billing webhook payload", {
      type: envelope.data.type,
    });
    return new Response("Invalid webhook payload", { status: 400 });
  }

  if (!mapped) {
    // Unhandled event type or non-organisation payer: acknowledge and move on.
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
