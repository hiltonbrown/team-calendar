import { auth, currentUser } from "@repo/auth/server";
import {
  computeWorkingDays,
  ensureCurrentUserPerson,
  hasActiveXeroConnection,
  listMyRecords,
  listTeamRecords,
  type RecordListItem,
} from "@repo/availability";
import { Button } from "@repo/design-system/components/ui/button";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/states/empty-state";
import { FetchErrorState } from "@/components/states/fetch-error-state";
import { requirePageRole } from "@/lib/auth/require-page-role";
import { withOrg } from "@/lib/navigation/org-url";
import { requireActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";
import { parseFilterParams } from "@/lib/url-state/parse-filter-params";
import { Header } from "../components/header";
import { type PlansFilterInput, PlansFilterSchema } from "./_schemas";
import { PlansClient, type PlansClientRecord } from "./plans-client";

export const metadata: Metadata = {
  description: "Plan leave and availability across calendars.",
  title: "Plans - Team Calendar",
};

interface PlansPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const PlansPage = async ({ searchParams }: PlansPageProps) => {
  await requirePageRole("org:viewer");

  const params = await searchParams;
  const { org, ...filterParams } = params;
  const orgParam = Array.isArray(org) ? org[0] : org;
  const { clerkOrgId, organisationId, orgQueryValue } =
    await requireActiveOrgPageContext(orgParam);
  const filters = parseFilterParams(filterParams, PlansFilterSchema) ?? {
    includeArchived: false,
    recordTypeCategory: "all",
    tab: "my",
  };
  const { orgRole } = await auth();
  const user = await currentUser();

  if (!user) {
    redirect("/");
  }

  const canViewTeam = isManagerOrAbove(orgRole);
  if (filters.tab === "team" && !canViewTeam) {
    redirect(withOrg("/plans?tab=my", orgQueryValue));
  }

  const currentPersonResult = await ensureCurrentUserPerson(
    {
      clerkOrgId,
      organisationId,
    },
    {
      avatarUrl: user.imageUrl,
      clerkUserId: user.id,
      displayName:
        [user.firstName, user.lastName].filter(Boolean).join(" ") ||
        user.emailAddresses[0]?.emailAddress ||
        user.id,
      email: user.emailAddresses[0]?.emailAddress,
      firstName: user.firstName,
      lastName: user.lastName,
    }
  );

  if (!currentPersonResult.ok) {
    return (
      <>
        <Header page="Plans" />
        <main className="flex flex-1 flex-col p-6 pt-0">
          <EmptyState
            actionSlot={
              <Button asChild variant="outline">
                <Link href={withOrg("/people", orgQueryValue)}>
                  Review people
                </Link>
              </Button>
            }
            description="Your Clerk account could not be linked to a single person profile. Review the people directory, then reload plans."
            title="Person profile needs review"
          />
        </main>
      </>
    );
  }

  const serviceFilters = {
    approvalStatus: filters.approvalStatus,
    dateRange: {
      from: filters.dateFrom
        ? new Date(`${filters.dateFrom}T00:00:00.000Z`)
        : undefined,
      to: filters.dateTo
        ? new Date(`${filters.dateTo}T23:59:59.999Z`)
        : undefined,
    },
    includeArchived: filters.includeArchived,
    personId: filters.tab === "team" ? filters.personId : undefined,
    recordType: filters.recordType,
    recordTypeCategory: filters.recordTypeCategory,
    sourceType: filters.sourceType,
  };

  const [recordsResult, hasXero] = await Promise.all([
    filters.tab === "team"
      ? listTeamRecords({
          actingOrgRole: orgRole,
          clerkOrgId,
          filters: serviceFilters,
          managerPersonId: currentPersonResult.value.id,
          organisationId,
        })
      : listMyRecords({
          clerkOrgId,
          filters: serviceFilters,
          organisationId,
          userId: user.id,
        }),
    hasActiveXeroConnection({ clerkOrgId, organisationId }),
  ]);

  if (!recordsResult.ok) {
    return (
      <>
        <Header page="Plans" />
        <main className="flex flex-1 flex-col p-6 pt-0">
          <FetchErrorState
            description="We could not load leave and availability records. Reload the page, then check the Xero connection if leave records still look out of date."
            entityName="plans"
          />
        </main>
      </>
    );
  }

  const records = await Promise.all(
    recordsResult.value.map(async (record) => {
      const duration = await computeWorkingDays({
        allDay: record.allDay,
        clerkOrgId,
        endsAt: record.endsAt,
        locationId: record.person.locationId,
        organisationId,
        startsAt: record.startsAt,
      });

      return toClientRecord(
        record,
        duration.ok ? duration.value : null,
        duration.ok ? null : duration.error.message
      );
    })
  );

  return (
    <>
      <Header page="Plans" />
      <main className="flex flex-1 flex-col gap-6 p-6 pt-0">
        {!hasXero && (
          <div className="rounded-2xl bg-muted p-5 text-muted-foreground text-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <p>
                Xero is not connected. Leave saves in Team Calendar only, so it
                appears on calendars but does not create payroll leave or enter
                the Xero approval queue.
              </p>
              {isAdminOrOwner(orgRole) && (
                <a
                  className="font-medium text-primary"
                  href={withOrg("/settings/integrations/xero", orgQueryValue)}
                >
                  Connect Xero to submit leave
                </a>
              )}
            </div>
          </div>
        )}

        <PlansClient
          canViewTeam={canViewTeam}
          filters={filters}
          hasActiveXeroConnection={hasXero}
          organisationId={organisationId}
          orgQueryValue={orgQueryValue}
          records={records}
        />

        {records.length === 0 && (
          <EmptyState
            actionSlot={
              filtersAreDefault(filters) ? (
                <Button asChild>
                  <Link href={withOrg("/plans/new", orgQueryValue)}>
                    Create a plan
                  </Link>
                </Button>
              ) : undefined
            }
            description={emptyStateDescription(filters)}
            title={
              filtersAreDefault(filters) ? "No plans yet" : "No matching plans"
            }
          />
        )}
      </main>
    </>
  );
};

export default PlansPage;

function toClientRecord(
  record: RecordListItem,
  workingDays: number | null,
  workingDaysError: string | null
): PlansClientRecord {
  return {
    allDay: record.allDay,
    approvalStatus: record.approvalStatus,
    archivedAt: record.archivedAt?.toISOString() ?? null,
    balanceChip: record.balanceChip,
    editableActions: record.editableActions,
    endsAt: record.endsAt.toISOString(),
    id: record.id,
    personName: `${record.person.firstName} ${record.person.lastName}`,
    recordType: record.recordType,
    sourceType: record.sourceType,
    startsAt: record.startsAt.toISOString(),
    workingDays,
    workingDaysError,
    xeroWriteError: record.xeroWriteError,
  };
}

function isManagerOrAbove(role: string | null | undefined): boolean {
  return role === "org:manager" || role === "org:admin" || role === "org:owner";
}

function isAdminOrOwner(role: string | null | undefined): boolean {
  return role === "org:admin" || role === "org:owner";
}

function filtersAreDefault(filters: PlansFilterInput): boolean {
  return (
    filters.tab === "my" &&
    filters.recordTypeCategory === "all" &&
    filters.includeArchived === false &&
    !filters.approvalStatus &&
    !filters.dateFrom &&
    !filters.dateTo &&
    !filters.personId &&
    !filters.recordType &&
    !filters.sourceType
  );
}

function emptyStateDescription(filters: PlansFilterInput): string {
  if (filtersAreDefault(filters)) {
    return "Create leave or availability so calendars, feeds, and approval queues have something to track.";
  }
  return "Change the filters or clear the date and status selections to see more leave and availability records.";
}
