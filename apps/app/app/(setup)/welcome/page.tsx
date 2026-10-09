import { auth, currentUser } from "@repo/auth/server";
import { getPersonProfile, loadWelcomeEligibility } from "@repo/availability";
import { Button } from "@repo/design-system/components/ui/button";
import { listFeeds, normaliseRole } from "@repo/feeds";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SetupColumn } from "@/components/setup/setup-column";
import { StepIndicator } from "@/components/setup/step-indicator";
import { FetchErrorState } from "@/components/states/fetch-error-state";
import { recommendFeed } from "@/lib/feeds/recommend-feed";
import { formatLeaveBalance } from "@/lib/format-leave-balance";
import { withOrg } from "@/lib/navigation/org-url";
import { requireActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";
import { StepHeading } from "../onboarding/steps/step-heading";
import { CalendarStep } from "./steps/calendar-step";
import { SkipToDashboard } from "./steps/welcome-controls";

export const metadata: Metadata = {
  description: "Get started with Team Calendar.",
  title: "Welcome | Team Calendar",
};

const STEPS = [
  { id: "identity", label: "This is you" },
  { id: "balances", label: "Your balances" },
  { id: "calendar", label: "Your calendar" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

function peopleRole(orgRole: string): "manager" | "viewer" {
  return orgRole === "org:manager" ? "manager" : "viewer";
}

interface WelcomePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const WelcomePage = async ({ searchParams }: WelcomePageProps) => {
  const params = await searchParams;
  const [{ orgRole }, user] = await Promise.all([auth(), currentUser()]);
  if (!(user && orgRole)) {
    redirect("/");
  }
  const { clerkOrgId, organisationId, orgQueryValue } =
    await requireActiveOrgPageContext(first(params.org));
  const homeHref = withOrg("/", orgQueryValue);
  const eligibility = await loadWelcomeEligibility({
    actingRole: orgRole,
    clerkOrgId,
    organisationId,
    userId: user.id,
  });
  if (
    !(
      eligibility.ok &&
      eligibility.value.eligible &&
      eligibility.value.personId
    )
  ) {
    redirect(homeHref);
  }
  const { personId } = eligibility.value;
  const step: StepId =
    STEPS.find((item) => item.id === first(params.step))?.id ?? "identity";
  const index = STEPS.findIndex((item) => item.id === step);
  const next = STEPS[index + 1];
  const stepHref = (id: StepId) =>
    withOrg(`/welcome?step=${id}`, orgQueryValue);

  let content: React.ReactNode;
  if (step === "calendar") {
    content = await calendarContent({
      clerkOrgId,
      homeHref,
      organisationId,
      orgRole,
      userId: user.id,
    });
  } else {
    const profile = await getPersonProfile({
      actingPersonId: personId,
      actingUserId: user.id,
      clerkOrgId,
      organisationId,
      personId,
      role: peopleRole(orgRole),
    });
    if (!profile.ok) {
      content = <FetchErrorState entityName="your profile" />;
    } else if (step === "identity") {
      content = <IdentityContent profile={profile.value} />;
    } else {
      content = <BalancesContent profile={profile.value} />;
    }
  }

  return (
    <SetupColumn>
      <StepIndicator
        completedIds={STEPS.slice(0, index).map((item) => item.id)}
        currentId={step}
        steps={STEPS}
      />
      {content}
      {next ? (
        <div className="space-y-2">
          <Button asChild className="w-full">
            <Link href={stepHref(next.id)}>Continue</Link>
          </Button>
          <SkipToDashboard
            homeHref={homeHref}
            organisationId={organisationId}
          />
        </div>
      ) : null}
    </SetupColumn>
  );
};

type Profile = Extract<
  Awaited<ReturnType<typeof getPersonProfile>>,
  { ok: true }
>["value"];

function IdentityContent({ profile }: { profile: Profile }) {
  const { header } = profile;
  const rows = [
    ["Name", `${header.firstName} ${header.lastName}`],
    ["Email", header.email],
    ["Team", header.team?.name ?? "Not set"],
    [
      "Manager",
      header.manager
        ? `${header.manager.firstName} ${header.manager.lastName}`
        : "Not set",
    ],
  ] as const;
  return (
    <div className="space-y-6">
      <StepHeading
        description="Team Calendar shows your leave and availability against this record."
        stepId="identity"
      >
        This is you
      </StepHeading>
      <dl className="divide-y divide-transparent rounded-lg bg-surface-container-low">
        {rows.map(([label, value]) => (
          <div className="flex justify-between gap-4 px-4 py-3" key={label}>
            <dt className="text-label-lg text-muted-foreground">{label}</dt>
            <dd className="text-right font-medium text-body-sm">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-body-sm text-muted-foreground">
        Not you? Ask your administrator to check your account.
      </p>
    </div>
  );
}

function BalancesContent({ profile }: { profile: Profile }) {
  const rows = profile.balances.rows.flatMap((row) => {
    const amount = formatLeaveBalance({
      amount: row.balanceUnits,
      currencyCode: row.currencyCode,
      unit: row.unitType,
    });
    return amount
      ? [{ amount, id: row.id, name: row.leaveTypeName ?? "Leave" }]
      : [];
  });
  return (
    <div className="space-y-6">
      <StepHeading
        description="Balances come from Xero Payroll, your organisation's source of truth."
        stepId="balances"
      >
        Your leave balances
      </StepHeading>
      {rows.length > 0 ? (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              className="flex justify-between gap-4 rounded-lg bg-surface-container-low px-4 py-3 text-body-sm"
              key={row.id}
            >
              <span>{row.name}</span>
              <span className="font-medium tabular-nums">{row.amount}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg bg-surface-container-low p-4 text-body-sm text-muted-foreground">
          {profile.balances.xeroLinked
            ? "Your leave balances will appear here after the next sync from Xero Payroll."
            : "Your leave balances will appear here once your organisation connects Xero Payroll."}
        </p>
      )}
    </div>
  );
}

async function calendarContent(input: {
  clerkOrgId: string;
  homeHref: string;
  organisationId: string;
  orgRole: string;
  userId: string;
}) {
  const feeds = await listFeeds({
    actingRole: normaliseRole(input.orgRole),
    actingUserId: input.userId,
    clerkOrgId: input.clerkOrgId,
    filters: { status: ["active"] },
    organisationId: input.organisationId,
  });
  const { recommended } = recommendFeed(feeds.ok ? feeds.value : []);
  const toFeed = (feed: typeof recommended) =>
    feed?.subscribeUrl
      ? { name: feed.name, subscribeUrl: feed.subscribeUrl }
      : null;
  const personal =
    recommended?.isOwnedByActor && recommended.kind === "personal"
      ? toFeed(recommended)
      : null;
  return (
    <CalendarStep
      fallbackFeed={personal ? null : toFeed(recommended)}
      homeHref={input.homeHref}
      organisationId={input.organisationId}
      personalFeed={personal}
    />
  );
}

export default WelcomePage;
