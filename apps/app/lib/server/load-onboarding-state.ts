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
    clerkOrgConnectionCount,
    activeXeroConnection,
    peopleCount,
    currentUserPerson,
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
    database.xeroConnection.count({
      where: {
        clerk_org_id: clerkOrgId,
        status: {
          in: ["active", "pending", "pending_tenant_selection", "stale"],
        },
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
  const showXeroSetupTask =
    clerkOrgConnectionCount === 0 ||
    (xeroConnectionState !== "connected" &&
      xeroConnectionState !== "not_connected");
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
  const xeroSetupSteps = xeroSetupStepsForState(
    xeroConnectionState,
    showXeroSetupTask
  );

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
  xeroConnectionState: import("@repo/core").XeroConnectionDisplayState,
  showXeroSetupTask: boolean
): OnboardingStep[] {
  return showXeroSetupTask
    ? [
        {
          ctaHref: "/settings/integrations/xero",
          ctaLabel:
            xeroConnectionState === "not_connected"
              ? "Connect Xero"
              : "Review Xero",
          description:
            xeroConnectionState === "not_connected"
              ? "Connect Xero now or skip for later. Team Calendar keeps a persistent setup task until the first payroll connection is in place."
              : xeroRecoveryMessage(xeroConnectionState),
          id: "xero",
          status: xeroConnectionState === "connected" ? "complete" : "optional",
          title:
            xeroConnectionState === "not_connected"
              ? "Connect Xero"
              : "Xero connection",
        },
      ]
    : [];
}
