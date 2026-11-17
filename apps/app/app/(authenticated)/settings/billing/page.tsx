import { hasPermission, requireAccount } from "@repo/auth/helpers";
import { getCurrentUser } from "@repo/auth/server";
import { getBillingSummary } from "@repo/availability";
import type { AccountId } from "@repo/core";
import {
  getActivationDashboardSummary,
  getSubscriptionForAccount,
  getUnresolvedStripeEventsForAccount,
  hasUnresolvedStripeEventForAccount,
  withTenantDb,
} from "@repo/database";
import type { Metadata } from "next";
import { FetchErrorState } from "@/components/states/fetch-error-state";
import { PermissionDeniedState } from "@/components/states/permission-denied-state";
import { requirePagePermission } from "@/lib/auth/require-page-permission";
import { resolveActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";
import { BillingClient } from "./billing-client";

export const metadata: Metadata = {
  description: "Review your current plan and usage.",
  title: "Billing - Settings - Team Calendar",
};

interface BillingPageProps {
  searchParams: Promise<{ org?: string }>;
}

// S-22 Settings > Billing. Billing, plan limits, and usage are enforced at the
// Account level. requirePagePermission below admits admins and owners and
// denies managers and below, so they can view billing status, usage, and any
// available Stripe self-serve actions. Resolve the acting role explicitly
// and pass it through to getBillingSummary.
const BillingPage = async ({ searchParams }: BillingPageProps) => {
  await requirePagePermission({ billing: ["read"] });
  const [user, { org }] = await Promise.all([getCurrentUser(), searchParams]);
  const accountId = (await requireAccount()) as AccountId;

  if (!user) {
    return <PermissionDeniedState />;
  }

  const isOwner = await hasPermission({ ownership: ["manage"] });
  const actingRole = isOwner ? "owner" : "admin";

  const prepared = await withTenantDb(accountId, async (db) => {
    const { organisationId } = await resolveActiveOrgPageContext(
      accountId,
      org,
      db
    );
    const summary = await getBillingSummary(
      {
        accountId,
        actingRole,
        actingUserId: user.id,
        organisationId,
      },
      db
    );

    if (!summary.ok) {
      return { kind: "error" as const };
    }

    const subscription = await getSubscriptionForAccount(accountId, db);
    const [billingSyncUnhealthy, failedStripeEvents, activation] = [
      await hasUnresolvedStripeEventForAccount(
        accountId,
        subscription?.stripe_event_created_at ?? null
      ),
      await getUnresolvedStripeEventsForAccount(accountId),
      await getActivationDashboardSummary({ accountId, organisationId }, db),
    ];

    await db.auditEvent.create({
      data: {
        account_id: accountId,
        action: "billing.viewed",
        actor_display: user.name || user.email || "Unknown user",
        actor_user_id: user.id,
        entity_id: organisationId,
        entity_type: "billing",
        metadata: {},
        organisation_id: organisationId,
        resource_id: organisationId,
        resource_type: "billing",
      },
    });

    return {
      activation,
      billingSyncUnhealthy,
      failedStripeEvents,
      kind: "ready" as const,
      summary: summary.value,
    };
  });
  if (prepared.kind === "error") {
    return <FetchErrorState entityName="billing" />;
  }
  const { summary, billingSyncUnhealthy, failedStripeEvents, activation } =
    prepared;

  return (
    <div className="space-y-6">
      <BillingClient
        summary={{
          billingSyncUnhealthy,
          failedStripeEvents,
          hasContactFlow: summary.hasContactFlow,
          hasUpgradeFlow: summary.hasUpgradeFlow,
          isOverLimit: summary.isOverLimit,
          plan: summary.plan,
          usage: summary.usage,
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
