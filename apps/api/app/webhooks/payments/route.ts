import { constructEvent, resolvePlanKey } from "@repo/billing";
import { recordStripeEvent, upsertSubscriptionFromWebhook } from "@repo/database";
import { inngest } from "@repo/jobs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/env";

const MetadataSchema = z.object({ clerk_org_id: z.string().min(1).optional() }).nullable();
const SessionSchema = z.object({
  customer: z.union([z.string(), z.object({ id: z.string() })]).nullable(),
  metadata: MetadataSchema,
  subscription: z.union([z.string(), z.object({ id: z.string() })]).nullable(),
});
const SubscriptionSchema = z.object({
  cancel_at_period_end: z.boolean().default(false),
  current_period_end: z.number().nullable().optional(),
  customer: z.union([z.string(), z.object({ id: z.string() })]),
  ended_at: z.number().nullable().optional(),
  id: z.string(),
  items: z.object({ data: z.array(z.object({ price: z.object({ id: z.string() }) })).min(1) }),
  metadata: MetadataSchema,
  status: z.string(),
});
const InvoiceSchema = z.object({
  subscription: z.union([z.string(), z.object({ id: z.string(), metadata: MetadataSchema, items: z.object({ data: z.array(z.object({ price: z.object({ id: z.string() }) })).min(1) }), status: z.string(), customer: z.union([z.string(), z.object({ id: z.string() })]), current_period_end: z.number().nullable().optional(), cancel_at_period_end: z.boolean().default(false), ended_at: z.number().nullable().optional() })]).nullable().optional(),
});

const objectId = (value: string | { id: string } | null | undefined) =>
  typeof value === "string" ? value : value?.id ?? null;
const dateFromSeconds = (value: number | null | undefined) =>
  value ? new Date(value * 1000) : null;

async function mirrorSubscription(data: z.infer<typeof SubscriptionSchema>) {
  const clerkOrgId = data.metadata?.clerk_org_id;
  if (!clerkOrgId) {
    console.warn("Stripe subscription event missing clerk_org_id metadata.");
    return;
  }
  const priceId = data.items.data[0]?.price.id;
  const plan = resolvePlanKey(priceId);
  if (!plan.ok) {
    console.warn("Stripe subscription event used an unknown price.");
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
    stripeSubscriptionId: data.id,
  });
  await inngest.send({ name: "recount-usage", data: { clerkOrgId, organisationId: "00000000-0000-4000-8000-000000000000" } });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const eventResult = constructEvent(rawBody, request.headers.get("stripe-signature"), env.STRIPE_WEBHOOK_SECRET);
  if (!eventResult.ok) {
    return NextResponse.json({ error: eventResult.error.message }, { status: 400 });
  }
  const event = eventResult.value;
  const shouldProcess = await recordStripeEvent(event.id, event.type);
  if (!shouldProcess) {
    return NextResponse.json({ received: true });
  }

  if (event.type === "checkout.session.completed") {
    const parsed = SessionSchema.safeParse(event.data.object);
    if (parsed.success) {
      const clerkOrgId = parsed.data.metadata?.clerk_org_id;
      if (!clerkOrgId) {
        console.warn("Stripe checkout session missing clerk_org_id metadata.");
      }
    }
  }

  if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
    const parsed = SubscriptionSchema.safeParse(event.data.object);
    if (parsed.success) {
      await mirrorSubscription(parsed.data);
    }
  }

  if (["invoice.payment_failed", "invoice.paid"].includes(event.type)) {
    const parsed = InvoiceSchema.safeParse(event.data.object);
    const subscription = parsed.success ? parsed.data.subscription : null;
    if (subscription && typeof subscription !== "string") {
      await mirrorSubscription(subscription);
    }
  }

  return NextResponse.json({ received: true });
}
