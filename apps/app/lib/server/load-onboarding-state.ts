import "server-only";
import { getXeroConnectionStateForScope } from "@repo/availability";
import {
  isCountryCode,
  toXeroConnectionDisplayState,
  type XeroConnectionDisplayState,
  xeroRecoveryMessage,
} from "@repo/core";
import { tenantDatabase } from "@repo/database";

export type OnboardingStepStatus = "complete" | "next" | "optional" | "pending";
export interface OnboardingStep {
  ctaHref: string;
  ctaLabel: string;
  description: string;
  id: "feed" | "holidays" | "xero";
  status: OnboardingStepStatus;
  title: string;
}
export interface OnboardingState {
  activeFeedCount: number;
  completedRequiredCount: number;
  isComplete: boolean;
  requiredCount: number;
  steps: OnboardingStep[];
  xeroConnectionState: XeroConnectionDisplayState;
}
interface LoadOnboardingStateInput {
  clerkOrgId: string;
  organisationId: string;
}

// Recommended next steps after the setup wizard: the wizard owns the
// organisation profile, Xero decision and people, so this lists only what
// remains useful afterwards.
export async function loadOnboardingState({
  clerkOrgId,
  organisationId,
}: LoadOnboardingStateInput): Promise<OnboardingState> {
  const scope = {
    archived_at: null,
    clerk_org_id: clerkOrgId,
    organisation_id: organisationId,
  };
  const [connection, organisation, activeFeedCount] = await Promise.all([
    getXeroConnectionStateForScope({ clerkOrgId, organisationId }),
    tenantDatabase(clerkOrgId).organisation.findFirst({
      select: { country_code: true },
      where: {
        archived_at: null,
        clerk_org_id: clerkOrgId,
        id: organisationId,
      },
    }),
    tenantDatabase(clerkOrgId).feed.count({
      where: { ...scope, status: { in: ["active", "paused"] } },
    }),
  ]);
  const xeroConnectionState = toXeroConnectionDisplayState(connection);
  // Official holidays apply automatically once the country is supported.
  const hasPublicHolidays = isCountryCode(organisation?.country_code);
  const hasFeeds = activeFeedCount > 0;
  const required: Array<{ complete: boolean; id: OnboardingStep["id"] }> = [
    { complete: hasPublicHolidays, id: "holidays" },
    { complete: hasFeeds, id: "feed" },
  ];
  const nextRequiredId = required.find((step) => !step.complete)?.id;
  const status = (id: OnboardingStep["id"], complete: boolean) => {
    if (complete) {
      return "complete" as const;
    }
    return id === nextRequiredId ? ("next" as const) : ("pending" as const);
  };

  const steps: OnboardingStep[] = [
    {
      ctaHref: "/settings/holidays",
      ctaLabel: "Review holidays",
      description:
        "Official public holidays apply automatically for your country and each location's state or region. Review them and add local or company days.",
      id: "holidays",
      status: status("holidays", hasPublicHolidays),
      title: "Review public holidays",
    },
    {
      ctaHref: "/feeds",
      ctaLabel: hasFeeds ? "Open calendar feeds" : "Create a feed",
      description: hasFeeds
        ? "Add the team calendar to Outlook, Google or Apple Calendar, and share it with your team."
        : "Create a calendar feed so people can see availability in the calendar app they already use.",
      id: "feed",
      status: status("feed", hasFeeds),
      title: "Add the calendar to your calendar app",
    },
    ...xeroStep(xeroConnectionState),
  ];
  const completedRequiredCount = required.filter(
    (step) => step.complete
  ).length;
  return {
    activeFeedCount,
    completedRequiredCount,
    isComplete: completedRequiredCount === required.length,
    requiredCount: required.length,
    steps,
    xeroConnectionState,
  };
}

// Shown only when the organisation is manual-only or its connection needs
// attention; a healthy connection needs no checklist item.
function xeroStep(state: XeroConnectionDisplayState): OnboardingStep[] {
  if (state === "connected") {
    return [];
  }
  if (state === "not_connected") {
    return [
      {
        ctaHref: "/settings/integrations/xero",
        ctaLabel: "Connect Xero",
        description:
          "Connect Xero Payroll to import people, leave and balances, and to write approved leave back.",
        id: "xero",
        status: "optional",
        title: "Connect Xero Payroll",
      },
    ];
  }
  return [
    {
      ctaHref: "/settings/integrations/xero",
      ctaLabel: "Review Xero",
      description: xeroRecoveryMessage(state),
      id: "xero",
      status: "optional",
      title: "Xero connection",
    },
  ];
}
