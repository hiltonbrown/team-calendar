import { auth, currentUser } from "@repo/auth/server";
import { isOnboardingAdmin, loadWizardSnapshot } from "@repo/availability";
import type { ClerkOrgId, OrganisationId } from "@repo/core";
import { resolveAccountCompanies } from "@repo/database/queries/account-companies";
import { getOrganisationById } from "@repo/database/queries/organisations";
import { ChevronLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SetupColumn } from "@/components/setup/setup-column";
import { StepIndicator } from "@/components/setup/step-indicator";
import { FetchErrorState } from "@/components/states/fetch-error-state";
import { withOrg } from "@/lib/navigation/org-url";
import { ensureDefaultOrganisation } from "@/lib/server/ensure-default-organisation";
import { loadOnboardingPeople } from "@/lib/server/load-onboarding-people";
import { requireActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";
import { DetailsStep } from "./steps/details-step";
import { FinishStep } from "./steps/finish-step";
import { InviteStep } from "./steps/invite-step";
import { PeopleStep } from "./steps/people-step";
import { XeroStep, xeroReturnMessage } from "./steps/xero-step";

export const metadata: Metadata = {
  description: "Set up Team Calendar for your organisation.",
  title: "Set up | Team Calendar",
};

const STEPS = [
  { id: "details", label: "Organisation" },
  { id: "xero", label: "Xero Payroll" },
  { id: "people", label: "People" },
  { id: "invites", label: "Invite" },
  { id: "finish", label: "Finish" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

const stepIndex = (step: StepId) => STEPS.findIndex((item) => item.id === step);

interface OnboardingPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(value: string | string[] | undefined): string | null {
  const item = Array.isArray(value) ? value[0] : value;
  return item?.trim() ? item.trim() : null;
}

const OnboardingPage = async ({ searchParams }: OnboardingPageProps) => {
  const params = await searchParams;
  const [{ orgId, orgRole }, user] = await Promise.all([auth(), currentUser()]);
  if (!(orgId && user && isOnboardingAdmin(orgRole))) {
    redirect("/");
  }
  let requestedOrganisationId = first(params.org) ?? undefined;
  if (!requestedOrganisationId) {
    const companies = await resolveAccountCompanies(orgId);
    if (companies.length === 0) {
      // First-run onboarding explicitly provisions the account's initial company.
      const initial = await ensureDefaultOrganisation(orgId as ClerkOrgId);
      requestedOrganisationId = initial.organisationId;
    }
  }
  const { clerkOrgId, organisationId, orgQueryValue } =
    await requireActiveOrgPageContext(requestedOrganisationId);
  const actor = {
    actingRole: orgRole,
    clerkOrgId,
    organisationId,
    userId: user.id,
  };
  const snapshot = await loadWizardSnapshot(actor);
  if (!snapshot.ok) {
    return (
      <SetupColumn>
        <FetchErrorState entityName="setup progress" />
      </SetupColumn>
    );
  }
  if (snapshot.value.completed) {
    redirect(withOrg("/calendar", orgQueryValue));
  }

  const storedStep = snapshot.value.step;
  // Earlier steps can be revisited with Back; later steps cannot be skipped to.
  const requested = STEPS.find((item) => item.id === first(params.step));
  const viewStep =
    requested && stepIndex(requested.id) < stepIndex(storedStep)
      ? requested.id
      : storedStep;
  const doneHref = withOrg("/onboarding", orgQueryValue);
  const previous = STEPS[stepIndex(viewStep) - 1];
  const content = await stepContent({
    clerkOrgId,
    doneHref,
    organisationId,
    orgQueryValue,
    params,
    snapshot: snapshot.value,
    userId: user.id,
    viewStep,
  });
  const wide = viewStep === "people" || viewStep === "invites";

  return (
    <SetupColumn width={wide ? "wide" : "narrow"}>
      <StepIndicator
        completedIds={STEPS.slice(0, stepIndex(storedStep)).map(
          (item) => item.id
        )}
        currentId={viewStep}
        steps={STEPS}
      />
      {previous ? (
        <Link
          className="inline-flex min-h-11 w-fit items-center gap-1 font-medium text-label-lg text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          href={withOrg(`/onboarding?step=${previous.id}`, orgQueryValue)}
        >
          <ChevronLeftIcon aria-hidden="true" className="size-4" />
          Back
        </Link>
      ) : null}
      {content}
    </SetupColumn>
  );
};

async function stepContent(props: {
  clerkOrgId: ClerkOrgId;
  doneHref: string;
  orgQueryValue: string | null;
  organisationId: OrganisationId;
  params: Record<string, string | string[] | undefined>;
  snapshot: Extract<
    Awaited<ReturnType<typeof loadWizardSnapshot>>,
    { ok: true }
  >["value"];
  userId: string;
  viewStep: StepId;
}) {
  const { snapshot } = props;
  if (props.viewStep === "details") {
    const organisation = await getOrganisationById(
      props.clerkOrgId,
      props.organisationId
    );
    return (
      <DetailsStep
        doneHref={props.doneHref}
        name={organisation.ok ? organisation.value.name : ""}
        organisationId={props.organisationId}
        timezone={organisation.ok ? organisation.value.timezone : null}
      />
    );
  }
  if (props.viewStep === "xero") {
    return (
      <XeroStep
        connected={snapshot.mode === "xero"}
        doneHref={props.doneHref}
        organisationId={props.organisationId}
        returnMessage={xeroReturnMessage({
          cancelled: first(props.params.xero) === "cancelled",
          errorCode: first(props.params.xero_error),
        })}
      />
    );
  }
  if (props.viewStep === "finish") {
    return (
      <FinishStep
        calendarHref={withOrg("/calendar", props.orgQueryValue)}
        mode={snapshot.mode}
        organisationId={props.organisationId}
        stages={snapshot.import}
      />
    );
  }
  const people = await loadOnboardingPeople({
    clerkOrgId: props.clerkOrgId,
    organisationId: props.organisationId,
    userId: props.userId,
  });
  if (props.viewStep === "people") {
    return (
      <PeopleStep
        actingPerson={people.actingPerson}
        doneHref={props.doneHref}
        matches={people.matches}
        mode={snapshot.mode === "manual" ? "manual" : "xero"}
        organisationId={props.organisationId}
        peopleCount={people.peopleCount}
        peopleStage={snapshot.import.people}
        selfCandidates={people.selfCandidates}
      />
    );
  }
  return (
    <InviteStep
      doneHref={props.doneHref}
      organisationId={props.organisationId}
      roster={people.inviteRoster}
    />
  );
}

export default OnboardingPage;
