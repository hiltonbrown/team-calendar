import "server-only";

import { appError, type AppError, type PlanKey, type Result } from "@repo/core";
import { getSubscriptionForOrg, PLAN_CATALOGUE } from "@repo/database";
import Stripe from "stripe";

export const STRIPE_API_VERSION = "2025-11-17.clover";

let stripeClient: Stripe | null = null;

export const getStripe = (): Result<Stripe> => {
  if (!process.env.STRIPE_SECRET_KEY) {
    return { ok: false, error: appError("internal", "Stripe is not configured.") };
  }
  stripeClient ??= new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION });
  return { ok: true, value: stripeClient };
};

export const resolvePlanKey = (priceId: string): Result<PlanKey> => {
  const plan = PLAN_CATALOGUE.find((item) => item.priceId === priceId);
  if (!plan) {
    return { ok: false, error: appError("bad_request", "Unknown Stripe price.") };
  }
  return { ok: true, value: plan.plan_key };
};

const urlEnv = (key: string): Result<string> => {
  const value = process.env[key];
  if (!value) {
    return { ok: false, error: appError("internal", `${key} is not configured.`) };
  }
  return { ok: true, value };
};

export const createCheckoutSession = async (
  clerkOrgId: string,
  planKey: PlanKey
): Promise<Result<string, AppError>> => {
  const plan = PLAN_CATALOGUE.find((item) => item.plan_key === planKey);
  if (!plan?.priceId) {
    return { ok: false, error: appError("bad_request", "Contact sales for Enterprise billing.") };
  }
  const stripe = getStripe();
  const success = urlEnv("STRIPE_CHECKOUT_SUCCESS_URL");
  const cancel = urlEnv("STRIPE_CHECKOUT_CANCEL_URL");
  if (!(stripe.ok && success.ok && cancel.ok)) {
    return stripe.ok ? (success.ok ? cancel : success) : stripe;
  }
  const subscription = await getSubscriptionForOrg(clerkOrgId);
  const session = await stripe.value.checkout.sessions.create({
    automatic_tax: { enabled: true },
    cancel_url: cancel.value,
    customer: subscription?.stripe_customer_id ?? undefined,
    line_items: [{ price: plan.priceId, quantity: 1 }],
    metadata: { clerk_org_id: clerkOrgId },
    mode: "subscription",
    subscription_data: { metadata: { clerk_org_id: clerkOrgId } },
    success_url: success.value,
  });
  return session.url
    ? { ok: true, value: session.url }
    : { ok: false, error: appError("internal", "Stripe did not return a Checkout URL.") };
};

export const createPortalSession = async (clerkOrgId: string): Promise<Result<string>> => {
  const stripe = getStripe();
  const returnUrl = urlEnv("STRIPE_PORTAL_RETURN_URL");
  if (!(stripe.ok && returnUrl.ok)) {
    return stripe.ok ? returnUrl : stripe;
  }
  const subscription = await getSubscriptionForOrg(clerkOrgId);
  if (!subscription?.stripe_customer_id) {
    return { ok: false, error: appError("not_found", "No Stripe customer is stored for this organisation.") };
  }
  const session = await stripe.value.billingPortal.sessions.create({
    customer: subscription.stripe_customer_id,
    return_url: returnUrl.value,
  });
  return { ok: true, value: session.url };
};

export const constructEvent = (
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined
): Result<Stripe.Event> => {
  if (!(signatureHeader && secret)) {
    return { ok: false, error: appError("bad_request", "Missing Stripe webhook signature.") };
  }
  const stripe = getStripe();
  if (!stripe.ok) {
    return stripe;
  }
  try {
    return { ok: true, value: stripe.value.webhooks.constructEvent(rawBody, signatureHeader, secret) };
  } catch {
    return { ok: false, error: appError("bad_request", "Invalid Stripe webhook signature.") };
  }
};
