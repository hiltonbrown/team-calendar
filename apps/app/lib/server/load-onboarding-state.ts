import "server-only";

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
  hasActiveXeroConnection: boolean;
  isComplete: boolean;
  peopleCount: number;
  publicHolidayJurisdictionCount: number;
  requiredCount: number;
  steps: OnboardingStep[];
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
    clerkOrgConnectionCount,
    activeXeroConnection,
    peopleCount,
    currentUserPerson,
    publicHolidayJurisdictionCount,
    activeFeedCount,
  ] = await Promise.all([
    database.organisation.findFirst({
      where: {
        archived_at: null,
        clerk_org_id: clerkOrgId,
        id: organisationId,
      },
      select: {
        country_code: true,
        name: true,
      },
    }),
    database.xeroConnection.count({
      where: {
        clerk_org_id: clerkOrgId,
        status: {
          in: ["active", "pending", "pending_tenant_selection", "stale"],
        },
      },
    }),
    database.xeroConnection.findFirst({
      where: {
        clerk_org_id: clerkOrgId,
        disconnected_at: null,
        organisation_id: organisationId,
        status: "active",
        revoked_at: null,
      },
      select: { id: true },
    }),
    database.person.count({
      where: {
        archived_at: null,
        clerk_org_id: clerkOrgId,
        organisation_id: organisationId,
      },
    }),
    userId
      ? database.person.findFirst({
          where: {
            archived_at: null,
            clerk_org_id: clerkOrgId,
            clerk_user_id: userId,
            organisation_id: organisationId,
          },
          select: { id: true },
        })
      : Promise.resolve(null),
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
  const hasActiveXeroConnection = Boolean(activeXeroConnection);
  const showXeroSetupTask = clerkOrgConnectionCount === 0;
  const hasPeople = peopleCount > 0;
  const currentUserPersonLinked = userId ? Boolean(currentUserPerson) : null;
  const hasPeopleForCurrentUser =
    hasPeople && (currentUserPersonLinked ?? true);
  const hasPublicHolidays = publicHolidayJurisdictionCount > 0;
  const hasFeeds = activeFeedCount > 0;

  const requiredSteps: Array<{ complete: boolean; id: OnboardingStep["id"] }> =
    [
      { complete: hasProfile, id: "profile" },
      { complete: hasPeopleForCurrentUser, id: "people" },
      { complete: hasPublicHolidays, id: "holidays" },
      { complete: hasFeeds, id: "feed" },
    ];
  const nextRequiredId = requiredSteps.find((step) => !step.complete)?.id;
  const xeroSetupSteps: OnboardingStep[] = showXeroSetupTask
    ? [
        {
          ctaHref: "/settings/integrations/xero",
          ctaLabel: hasActiveXeroConnection ? "Manage Xero" : "Connect Xero",
          description:
            "Connect Xero now or skip for later. LeaveSync keeps a persistent setup task until the first payroll connection is in place.",
          id: "xero",
          status: hasActiveXeroConnection ? "complete" : "next",
          title: "Connect Xero",
        },
      ]
    : [];

  const steps: OnboardingStep[] = [
    {
      ctaHref: "/settings/general",
      ctaLabel: "Review profile",
      description: organisation
        ? `${organisation.name} is set to ${organisation.country_code}. Confirm the country, region, and timezone before importing holidays.`
        : "Confirm the organisation name, country, region, and timezone.",
      id: "profile",
      status: statusForRequiredStep("profile", hasProfile, nextRequiredId),
      title: "Review organisation profile",
    },
    ...xeroSetupSteps,
    {
      ctaHref: "/people",
      ctaLabel: hasPeople ? "View people" : "Add people",
      description:
        hasPeople && currentUserPersonLinked === false
          ? "People exist, but your user account is not linked to a person yet. Review the directory before creating plans."
          : "People can be added manually or synced from Xero when an integration is connected.",
      id: "people",
      status: statusForRequiredStep(
        "people",
        hasPeopleForCurrentUser,
        nextRequiredId
      ),
      title: "Add or sync people",
    },
    {
      ctaHref: "/settings/holidays",
      ctaLabel: hasPublicHolidays ? "Review holidays" : "Set holidays",
      description:
        "Configure public holidays so calendars and working-day calculations match the organisation.",
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
      ctaLabel: hasFeeds ? "View feeds" : "Create feed",
      description:
        "Create an ICS feed when you are ready to publish availability to team calendars.",
      id: "feed",
      status: statusForRequiredStep("feed", hasFeeds, nextRequiredId),
      title: "Publish a calendar feed",
    },
  ];

  const completedRequiredCount = requiredSteps.filter(
    (step) => step.complete
  ).length;

  return {
    activeFeedCount,
    completedRequiredCount,
    currentUserPersonLinked,
    hasActiveXeroConnection,
    isComplete: completedRequiredCount === requiredSteps.length,
    peopleCount,
    publicHolidayJurisdictionCount,
    requiredCount: requiredSteps.length,
    steps,
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
