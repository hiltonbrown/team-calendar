import "server-only";
import { getXeroConnectionStateForScope } from "@repo/availability";
import {
  toXeroConnectionDisplayState,
  type XeroConnectionDisplayState,
  xeroRecoveryMessage,
} from "@repo/core";
import { database } from "@repo/database";

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
  publicHolidayJurisdictionCount: number;
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
  const [connection, publicHolidayJurisdictionCount, activeFeedCount] =
    await Promise.all([
      getXeroConnectionStateForScope({ clerkOrgId, organisationId }),
      database.publicHolidayJurisdiction.count({
        where: { ...scope, is_enabled: true },
      }),
      database.feed.count({
        where: { ...scope, status: { in: ["active", "paused"] } },
      }),
    ]);
  const xeroConnectionState = toXeroConnectionDisplayState(connection);
  const hasPublicHolidays = publicHolidayJurisdictionCount > 0;
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
        "Team Calendar imports your country's public holidays. Check regional dates and add any of your own.",
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
    publicHolidayJurisdictionCount,
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
