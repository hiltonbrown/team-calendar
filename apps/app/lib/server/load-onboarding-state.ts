import "server-only";
import { getXeroConnectionStateForScope } from "@repo/availability";
import { toXeroConnectionDisplayState, xeroRecoveryMessage } from "@repo/core";
import { database } from "@repo/database";
export type OnboardingStepStatus = "complete" | "next" | "optional" | "pending";
export interface OnboardingStep {
  ctaHref: string;
  ctaLabel: string;
  description: string;
  id: "feed" | "holidays" | "people" | "profile" | "xero";
  status: OnboardingStepStatus;
  title: string;
}
export interface OnboardingState {
  activeFeedCount: number;
  completedRequiredCount: number;
  currentUserPersonLinked: boolean | null;
  isComplete: boolean;
  pendingPersonMatchesCount: number;
  peopleCount: number;
  publicHolidayJurisdictionCount: number;
  requiredCount: number;
  steps: OnboardingStep[];
  xeroConnectionState: import("@repo/core").XeroConnectionDisplayState;
}
interface LoadOnboardingStateInput {
  clerkOrgId: string;
  organisationId: string;
  userId?: string | null;
}
export async function loadOnboardingState({
  clerkOrgId,
  organisationId,
  userId,
}: LoadOnboardingStateInput): Promise<OnboardingState> {
  const [
    organisation,
    activeXeroConnection,
    peopleCount,
    currentUserPerson,
    pendingPersonMatchesCount,
    publicHolidayJurisdictionCount,
    activeFeedCount,
  ] = await Promise.all([
    database.organisation.findFirst({
      select: {
        country_code: true,
        name: true,
      },
      where: {
        archived_at: null,
        clerk_org_id: clerkOrgId,
        id: organisationId,
      },
    }),
    getXeroConnectionStateForScope({ clerkOrgId, organisationId }),
    database.person.count({
      where: {
        archived_at: null,
        clerk_org_id: clerkOrgId,
        organisation_id: organisationId,
      },
    }),
    userId
      ? database.person.findFirst({
          select: { id: true },
          where: {
            archived_at: null,
            clerk_org_id: clerkOrgId,
            clerk_user_id: userId,
            organisation_id: organisationId,
          },
        })
      : Promise.resolve(null),
    database.xeroPersonMatch?.count
      ? database.xeroPersonMatch.count({
          where: {
            clerk_org_id: clerkOrgId,
            organisation_id: organisationId,
            status: "pending",
          },
        })
      : Promise.resolve(0),
    database.publicHolidayJurisdiction.count({
      where: {
        archived_at: null,
        clerk_org_id: clerkOrgId,
        is_enabled: true,
        organisation_id: organisationId,
      },
    }),
    database.feed.count({
      where: {
        archived_at: null,
        clerk_org_id: clerkOrgId,
        organisation_id: organisationId,
        status: { in: ["active", "paused"] },
      },
    }),
  ]);
  const hasProfile = Boolean(organisation);
  const xeroConnectionState =
    toXeroConnectionDisplayState(activeXeroConnection);
  const hasPeople = peopleCount > 0;
  const isPeopleComplete = hasPeople && pendingPersonMatchesCount === 0;
  const currentUserPersonLinked = userId ? Boolean(currentUserPerson) : null;
  const hasPublicHolidays = publicHolidayJurisdictionCount > 0;
  const hasFeeds = activeFeedCount > 0;
  const requiredSteps: Array<{
    complete: boolean;
    id: OnboardingStep["id"];
  }> = [
    { complete: hasProfile, id: "profile" },
    { complete: isPeopleComplete, id: "people" },
    { complete: hasPublicHolidays, id: "holidays" },
    { complete: hasFeeds, id: "feed" },
  ];
  const nextRequiredId = requiredSteps.find((step) => !step.complete)?.id;
  const xeroSetupSteps = xeroSetupStepsForState(xeroConnectionState);
  const steps: OnboardingStep[] = [
    {
      ctaHref: "/settings/general",
      ctaLabel: "Review profile",
      description: organisation
        ? `${organisation.name} is set to ${organisation.country_code}. Confirm the country, region, and timezone used for public holiday defaults.`
        : "Confirm the organisation name, country, region, and timezone.",
      id: "profile",
      status: statusForRequiredStep("profile", hasProfile, nextRequiredId),
      title: "Review organisation profile",
    },
    ...xeroSetupSteps,
    {
      ctaHref:
        pendingPersonMatchesCount > 0
          ? "/settings/integrations/xero/matches"
          : "/people",
      ctaLabel: getPeopleCtaLabel(pendingPersonMatchesCount, hasPeople),
      description: getPeopleDescription(
        pendingPersonMatchesCount,
        hasPeople,
        currentUserPersonLinked
      ),
      id: "people",
      status: statusForRequiredStep("people", isPeopleComplete, nextRequiredId),
      title:
        pendingPersonMatchesCount > 0
          ? "Review imported people"
          : "Add or sync people",
    },
    {
      ctaHref: "/settings/holidays",
      ctaLabel: hasPublicHolidays ? "Review holidays" : "Review setup",
      description:
        "Team Calendar imports your organisation's country holidays automatically. Review regional or custom dates.",
      id: "holidays",
      status: statusForRequiredStep(
        "holidays",
        hasPublicHolidays,
        nextRequiredId
      ),
      title: "Review public holidays",
    },
    {
      ctaHref: "/feeds",
      ctaLabel: hasFeeds ? "View default feed" : "Create feed",
      description: hasFeeds
        ? "Your default all-staff feed is ready. Open it whenever you need to copy its subscribe URL."
        : "Create an ICS feed manually if this organisation does not have a default feed available.",
      id: "feed",
      status: statusForRequiredStep("feed", hasFeeds, nextRequiredId),
      title: "Review calendar feed",
    },
  ];
  const completedRequiredCount = requiredSteps.filter(
    (step) => step.complete
  ).length;
  return {
    activeFeedCount,
    completedRequiredCount,
    currentUserPersonLinked,
    isComplete: completedRequiredCount === requiredSteps.length,
    pendingPersonMatchesCount,
    peopleCount,
    publicHolidayJurisdictionCount,
    requiredCount: requiredSteps.length,
    steps,
    xeroConnectionState,
  };
}
function statusForRequiredStep(
  id: OnboardingStep["id"],
  complete: boolean,
  nextRequiredId: OnboardingStep["id"] | undefined
): OnboardingStepStatus {
  if (complete) {
    return "complete";
  }
  return id === nextRequiredId ? "next" : "pending";
}
function xeroSetupStepsForState(
  xeroConnectionState: import("@repo/core").XeroConnectionDisplayState
): OnboardingStep[] {
  switch (xeroConnectionState) {
    case "connected":
      return [
        {
          ctaHref: "/settings/integrations/xero",
          ctaLabel: "Manage Xero",
          description: "Connected to Xero Payroll.",
          id: "xero",
          status: "complete",
          title: "Xero connection",
        },
      ];
    case "not_connected":
      return [
        {
          ctaHref: "/settings/integrations/xero",
          ctaLabel: "Connect Xero",
          description:
            "Connect Xero now or skip for later. Team Calendar keeps a persistent setup task until the first payroll connection is in place.",
          id: "xero",
          status: "optional",
          title: "Connect Xero",
        },
      ];
    default:
      return [
        {
          ctaHref: "/settings/integrations/xero",
          ctaLabel: "Review Xero",
          description: xeroRecoveryMessage(xeroConnectionState),
          id: "xero",
          status: "optional",
          title: "Xero connection",
        },
      ];
  }
}
function getPeopleCtaLabel(
  pendingPersonMatchesCount: number,
  hasPeople: boolean
): string {
  if (pendingPersonMatchesCount > 0) {
    return "Review people";
  }
  if (hasPeople) {
    return "View people";
  }
  return "Add people";
}
function getPeopleDescription(
  pendingPersonMatchesCount: number,
  hasPeople: boolean,
  currentUserPersonLinked: boolean | null
): string {
  if (pendingPersonMatchesCount > 0) {
    return `${pendingPersonMatchesCount} imported ${pendingPersonMatchesCount === 1 ? "person needs" : "people need"} identity review before linking.`;
  }
  if (hasPeople && currentUserPersonLinked === false) {
    return "People exist, but your user account is not linked to a person yet. Review the directory before creating plans.";
  }
  return "People can be added manually or synced from Xero when an integration is connected.";
}
