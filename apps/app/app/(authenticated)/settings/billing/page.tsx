import { requireRole } from "@repo/auth/helpers";
import { currentUser } from "@repo/auth/server";
import { getBillingSummary } from "@repo/availability";
import {
  database,
  getActivationDashboardSummary,
  getSubscriptionForOrg,
  getUnresolvedStripeEventsForOrg,
  hasUnresolvedStripeEventForOrg,
} from "@repo/database";
import type { Metadata } from "next";
import { FetchErrorState } from "@/components/states/fetch-error-state";
import { PermissionDeniedState } from "@/components/states/permission-denied-state";
import { requirePageRole } from "@/lib/auth/require-page-role";
import { requireActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";
import { BillingClient } from "./billing-client";

export const metadata: Metadata = {
  description: "Review your current plan and usage.",
  title: "Billing - Settings - Team Calendar",
};

interface BillingPageProps {
  searchParams: Promise<{ org?: string }>;
}

// S-22 Settings > Billing. Billing, plan limits, and usage are enforced at the
// Clerk Organisation level. requirePageRole below admits admins and owners and
// denies managers and below, so they can view billing status, usage, and any
// available Stripe self-serve actions. Clerk assigns the org creator org:admin
// by default; org:owner is a distinct higher role, so we resolve the acting role
// explicitly and pass it through to getBillingSummary.
const BillingPage = async ({ searchParams }: BillingPageProps) => {
  await requirePageRole("org:admin");
  const [user, { org }] = await Promise.all([currentUser(), searchParams]);
  const { clerkOrgId, organisationId } = await requireActiveOrgPageContext(org);

  if (!user) {
    return <PermissionDeniedState />;
  }

  const isOwner = await requireRole("org:owner");
  const actingRole = isOwner ? "owner" : "admin";

  const summary = await getBillingSummary({
    actingRole,
    actingUserId: user.id,
    clerkOrgId,
    organisationId,
  });

  if (!summary.ok) {
    return <FetchErrorState entityName="billing" />;
  }

  const subscription = await getSubscriptionForOrg(clerkOrgId);
  const [billingSyncUnhealthy, failedStripeEvents, activation] =
    await Promise.all([
      hasUnresolvedStripeEventForOrg(
        clerkOrgId,
        subscription?.stripe_event_created_at ?? null
      ),
      getUnresolvedStripeEventsForOrg(clerkOrgId),
      getActivationDashboardSummary({ clerkOrgId, organisationId }),
    ]);

  await database.auditEvent.create({
    data: {
      action: "billing.viewed",
      actor_display:
        [user.firstName, user.lastName].filter(Boolean).join(" ") ||
        user.emailAddresses[0]?.emailAddress ||
        "Unknown user",
      actor_user_id: user.id,
      clerk_org_id: clerkOrgId,
      entity_id: organisationId,
      entity_type: "billing",
      metadata: {},
      organisation_id: organisationId,
      resource_id: organisationId,
      resource_type: "billing",
    },
  });

  return (
    <div className="space-y-6">
      <BillingClient
        summary={{
          billingSyncUnhealthy,
          failedStripeEvents,
          hasContactFlow: summary.value.hasContactFlow,
          hasUpgradeFlow: summary.value.hasUpgradeFlow,
          isOverLimit: summary.value.isOverLimit,
          plan: summary.value.plan,
          usage: summary.value.usage,
        }}
      />
      <section className="rounded-xl bg-muted p-6">
        <h2 className="font-semibold text-title-lg">Activation operations</h2>
        <p className="mb-4 text-muted-foreground">
          Durable milestones and current failures requiring attention.
        </p>
        <dl className="grid gap-3 sm:grid-cols-3">
          <div>
            <dt>Completed milestones</dt>
            <dd className="font-semibold text-title-lg">
              {Object.values(activation.milestones).filter(Boolean).length}/6
            </dd>
          </div>
          <div>
            <dt>Sync and Xero failures</dt>
            <dd className="font-semibold text-title-lg">
              {activation.failures.syncRecords + activation.failures.xeroWrites}
            </dd>
          </div>
          <div>
            <dt>Stripe delivery failures</dt>
            <dd className="font-semibold text-title-lg">
              {activation.failures.stripeDeliveries}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
};

export default BillingPage;
