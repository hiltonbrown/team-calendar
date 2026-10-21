import { auth, currentUser } from "@repo/auth/server";
import { isOnboardingAdmin, loadWizardSnapshot } from "@repo/availability";
import type { ClerkOrgId, OrganisationId } from "@repo/core";
import { type TenantDb, withTenantDb } from "@repo/database";
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
import { resolveActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";
import { DetailsStep } from "./steps/details-step";
import { FinishStep } from "./steps/finish-step";
import { InviteStep } from "./steps/invite-step";
import { PeopleStep } from "./steps/people-step";
import { xeroReturnMessage } from "./steps/xero-return-message";
import { XeroStep } from "./steps/xero-step";

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
  const clerkOrgId = orgId as ClerkOrgId;
  const requestedOrganisationId = first(params.org) ?? undefined;
  let prepared = await withTenantDb(clerkOrgId, (db) =>
    prepareOnboardingPage(
      clerkOrgId,
      user.id,
      orgRole,
      requestedOrganisationId,
      params,
      db
    )
  );
  if (prepared.kind === "provision") {
    // First-run company provisioning has Clerk and database phases, outside the page read scope.
    const initial = await ensureDefaultOrganisation(clerkOrgId);
    prepared = await withTenantDb(clerkOrgId, (db) =>
      prepareOnboardingPage(
        clerkOrgId,
        user.id,
        orgRole,
        initial.organisationId,
        params,
        db
      )
    );
  }
  if (prepared.kind === "provision") {
    throw new Error("Initial company could not be prepared.");
  }
  if (prepared.kind === "error") {
    return (
      <SetupColumn>
        <FetchErrorState entityName="setup progress" />
      </SetupColumn>
    );
  }
  const {
    organisationId,
    orgQueryValue,
    snapshot,
    storedStep,
    viewStep,
    organisation,
    people,
  } = prepared;
  const doneHref = withOrg("/onboarding", orgQueryValue);
  const previous = STEPS[stepIndex(viewStep) - 1];
  const content = stepContent({
    clerkOrgId,
    doneHref,
    organisation,
    organisationId,
    orgQueryValue,
    params,
    people,
    snapshot,
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

async function prepareOnboardingPage(
  clerkOrgId: ClerkOrgId,
  userId: string,
  orgRole: string | null | undefined,
  requestedOrganisationId: string | undefined,
  params: Record<string, string | string[] | undefined>,
  db: TenantDb
) {
  let selectedOrganisationId = requestedOrganisationId;
  if (!selectedOrganisationId) {
    const companies = await resolveAccountCompanies(clerkOrgId, db);
    if (!companies.length) {
      return { kind: "provision" as const };
    }
    selectedOrganisationId = companies[0]?.id;
  }
  const { organisationId, orgQueryValue } = await resolveActiveOrgPageContext(
    clerkOrgId,
    selectedOrganisationId,
    db
  );
  const result = await loadWizardSnapshot(
    { actingRole: orgRole, clerkOrgId, organisationId, userId },
    db
  );
  if (!result.ok) {
    return { kind: "error" as const, message: result.error.message };
  }
  const { value: snapshot } = result;
  if (snapshot.completed) {
    redirect(withOrg("/calendar", orgQueryValue));
  }
  const { step: storedStep } = snapshot;
  const requested = STEPS.find((item) => item.id === first(params.step));
  const viewStep =
    requested && stepIndex(requested.id) < stepIndex(storedStep)
      ? requested.id
      : storedStep;
  const organisation =
    viewStep === "details"
      ? await getOrganisationById(clerkOrgId, organisationId, db)
      : null;
  const people =
    viewStep === "people" || viewStep === "invites"
      ? await loadOnboardingPeople({ clerkOrgId, organisationId, userId }, db)
      : null;
  return {
    kind: "ready" as const,
    organisation,
    organisationId,
    orgQueryValue,
    people,
    snapshot,
    storedStep,
    viewStep,
  };
}

function stepContent(props: {
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
  organisation: Awaited<ReturnType<typeof getOrganisationById>> | null;
  people: Awaited<ReturnType<typeof loadOnboardingPeople>> | null;
}) {
  const { snapshot } = props;
  if (props.viewStep === "details") {
    const { organisation } = props;
    return (
      <DetailsStep
        doneHref={props.doneHref}
        name={organisation?.ok ? organisation.value.name : ""}
        organisationId={props.organisationId}
        timezone={organisation?.ok ? organisation.value.timezone : null}
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
  const { people } = props;
  if (!people) {
    return <FetchErrorState entityName="people" />;
  }
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
