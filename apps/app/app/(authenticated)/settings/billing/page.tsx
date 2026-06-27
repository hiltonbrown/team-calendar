import { currentUser } from "@repo/auth/server";
import { database, getBillingOverview } from "@repo/database";
import type { Metadata } from "next";
import { FetchErrorState } from "@/components/states/fetch-error-state";
import { PermissionDeniedState } from "@/components/states/permission-denied-state";
import { requirePageRole } from "@/lib/auth/require-page-role";
import { requireActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";
import { BillingClient, type BillingView } from "./billing-client";

export const metadata: Metadata = {
  description: "Review your current plan and usage.",
  title: "Billing - Settings - Team Calendar",
};

interface BillingPageProps {
  searchParams: Promise<{ org?: string }>;
}

// Display labels and units for each hard-limit dimension. Limit values and plan
// keys live solely in PLAN_CATALOGUE; this is presentation only.
const LIMIT_DISPLAY: Record<string, { label: string; unit: string }> = {
  feeds: { label: "Active feeds", unit: "feeds" },
  payroll_entities: { label: "Payroll entities", unit: "entities" },
  seats: { label: "People", unit: "people" },
};

// S-22 Settings > Billing is Owner only. Billing, plan limits, and usage are
// enforced at the Clerk Organisation level, and the catalogue reserves this
// surface for the account owner. The view is read-only: plan changes are made
// through Clerk's hosted billing portal, not rebuilt here.
const BillingPage = async ({ searchParams }: BillingPageProps) => {
  await requirePageRole("org:owner");
  const [user, { org }] = await Promise.all([currentUser(), searchParams]);
  const { clerkOrgId, organisationId } = await requireActiveOrgPageContext(org);

  if (!user) {
    return <PermissionDeniedState />;
  }

  const overview = await getBillingOverview(clerkOrgId);
  if (!overview.ok) {
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

  const view: BillingView = {
    billingInterval: overview.value.billingInterval,
    cancelAtPeriodEnd: overview.value.cancelAtPeriodEnd,
    currentPeriodEnd: overview.value.currentPeriodEnd,
    planName: overview.value.planName,
    status: overview.value.status,
    usage: overview.value.usage.map((item) => ({
      current: item.current,
      label: LIMIT_DISPLAY[item.limitType]?.label ?? item.limitType,
      limit: item.limit,
      unit: LIMIT_DISPLAY[item.limitType]?.unit ?? "units",
    })),
  };

  return <BillingClient view={view} />;
};

export default BillingPage;
