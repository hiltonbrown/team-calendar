import { requireRole } from "@repo/auth/helpers";
import { currentUser } from "@repo/auth/server";
import { getBillingSummary } from "@repo/availability";
import { database } from "@repo/database";
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
    <BillingClient
      summary={{
        hasContactFlow: summary.value.hasContactFlow,
        hasUpgradeFlow: summary.value.hasUpgradeFlow,
        isOverLimit: summary.value.isOverLimit,
        plan: summary.value.plan,
        usage: summary.value.usage,
      }}
    />
  );
};

export default BillingPage;
