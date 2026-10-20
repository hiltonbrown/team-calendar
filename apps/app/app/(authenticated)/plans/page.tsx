import { auth, currentUser } from "@repo/auth/server";
import {
  computeWorkingDaysFromReferenceData,
  ensureCurrentUserPerson,
  getXeroConnectionStateForScope,
  listMyRecordsPage,
  listTeamRecordsPage,
  loadWorkingDaysReferenceData,
  type RecordListItem,
} from "@repo/availability";
import {
  type ClerkOrgId,
  type OrganisationId,
  type Result,
  toXeroConnectionDisplayState,
} from "@repo/core";
import {
  resolveAccountCompanies,
  TENANT_READ_TRANSACTION_OPTIONS,
  withTenantResult,
} from "@repo/database";
import { Button } from "@repo/design-system/components/ui/button";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/states/empty-state";
import { FetchErrorState } from "@/components/states/fetch-error-state";
import { XeroRecoveryNotice } from "@/components/xero/xero-recovery-notice";
import { requirePageRole } from "@/lib/auth/require-page-role";
import { withOrg } from "@/lib/navigation/org-url";
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
interface PreparedPlansPage {
  organisationId: OrganisationId;
  orgQueryValue: string;
  records: PlansClientRecord[];
  recordsPage: Extract<
    Awaited<ReturnType<typeof listMyRecordsPage>>,
    { ok: true }
  >["value"];
  xeroConnectionState: ReturnType<typeof toXeroConnectionDisplayState>;
}
interface PlansPageError {
  code: "person" | "records";
  message: string;
  orgQueryValue: string;
}
const PlansPage = async ({ searchParams }: PlansPageProps) => {
  await requirePageRole("org:viewer");
  const params = await searchParams;
  const { org, ...filterParams } = params;
  const orgParam = Array.isArray(org) ? org[0] : org;
  const filters = parseFilterParams(filterParams, PlansFilterSchema) ?? {
    includeArchived: false,
    recordTypeCategory: "all",
    tab: "my",
  };
  const [{ orgId, orgRole }, user] = await Promise.all([auth(), currentUser()]);
  if (!(orgId && user)) {
    redirect("/");
  }
  // Clerk supplies the authenticated account before one Result preparation scope.
  const clerkOrgId = orgId as ClerkOrgId;
  const canViewTeam = isManagerOrAbove(orgRole);
  const prepared = await withTenantResult(
    clerkOrgId,
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Authentication, scope and filter failures are rendered at the route boundary.
    async (db): Promise<Result<PreparedPlansPage, PlansPageError>> => {
      const companies = await resolveAccountCompanies(clerkOrgId, db);
      const existingPerson = await db.person.findFirst({
        orderBy: [{ created_at: "asc" }, { id: "asc" }],
        select: { organisation_id: true },
        where: {
          archived_at: null,
          clerk_org_id: clerkOrgId,
          clerk_user_id: user.id,
          organisation_id: {
            in: companies.map((preparedCompany) => preparedCompany.id),
          },
        },
      });
      const company = orgParam
        ? companies.find((preparedCompany2) => preparedCompany2.id === orgParam)
        : (companies.find(
            (preparedCompany3) =>
              preparedCompany3.id === existingPerson?.organisation_id
          ) ?? companies[0]);
      if (!company) {
        redirect("/onboarding");
      }
      // The UUID belongs to the authenticated account's owned company set.
      const organisationId = company.id as OrganisationId;
      const orgQueryValue = organisationId;
      if (filters.tab === "team" && !canViewTeam) {
        redirect(withOrg("/plans?tab=my", orgQueryValue));
      }
      const currentPersonResult = await ensureCurrentUserPerson(
        { clerkOrgId, organisationId },
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
        },
        db
      );
      if (!currentPersonResult.ok) {
        return {
          error: {
            code: "person",
            message: currentPersonResult.error.message,
            orgQueryValue,
          },
          ok: false,
        };
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
      const common = {
        allHistory: filters.allHistory ?? false,
        clerkOrgId,
        cursor: filters.cursor,
        filters: serviceFilters,
        organisationId,
        pageSize: filters.pageSize ?? 50,
      };
      const recordsResult =
        filters.tab === "team"
          ? await listTeamRecordsPage(
              {
                ...common,
                actingOrgRole: orgRole,
                managerPersonId: currentPersonResult.value.id,
              },
              db
            )
          : await listMyRecordsPage({ ...common, userId: user.id }, db);
      if (!recordsResult.ok) {
        return {
          error: {
            code: "records",
            message: recordsResult.error.message,
            orgQueryValue,
          },
          ok: false,
        };
      }
      const xeroStateResult = await getXeroConnectionStateForScope(
        { clerkOrgId, organisationId },
        db
      );
      const xeroConnectionState = toXeroConnectionDisplayState(xeroStateResult);
      const durationInputs = recordsResult.value.items.map((record) => ({
        allDay: record.allDay,
        clerkOrgId,
        endsAt: record.endsAt,
        locationId: record.person.locationId,
        organisationId,
        startsAt: record.startsAt,
      }));
      const durationReference = await loadWorkingDaysReferenceData(
        durationInputs,
        db
      );
      const records = recordsResult.value.items.map((record, index) => {
        const durationInput = durationInputs[index];
        if (!durationInput) {
          return toClientRecord(record, null, "Duration input is unavailable");
        }
        const duration = computeWorkingDaysFromReferenceData(
          durationInput,
          durationReference
        );
        return toClientRecord(
          record,
          duration.ok ? duration.value : null,
          duration.ok ? null : duration.error.message
        );
      });
      return {
        ok: true,
        value: {
          organisationId,
          orgQueryValue,
          records,
          recordsPage: recordsResult.value,
          xeroConnectionState,
        },
      };
    },
    TENANT_READ_TRANSACTION_OPTIONS
  );
  if (!prepared.ok) {
    return (
      <>
        <Header page="Plans" />
        <div className="flex flex-1 flex-col p-6 pt-0">
          {prepared.error.code === "person" ? (
            <EmptyState
              actionSlot={
                <Button asChild variant="outline">
                  <Link href={withOrg("/people", prepared.error.orgQueryValue)}>
                    Review people
                  </Link>
                </Button>
              }
              description="Your Clerk account could not be linked to a single person profile. Review the people directory, then reload plans."
              title="Person profile needs review"
            />
          ) : (
            <FetchErrorState entityName="plans" />
          )}
        </div>
      </>
    );
  }
  const { organisationId, orgQueryValue, records, xeroConnectionState } =
    prepared.value;
  const recordsResult = {
    ok: true as const,
    value: prepared.value.recordsPage,
  };
  return (
    <>
      <Header page="Plans" />
      <div className="flex flex-1 flex-col gap-6 p-6 pt-0">
        {xeroConnectionState === "not_connected" && (
          <div className="rounded-2xl bg-muted p-5 text-label-lg text-muted-foreground">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <p>
                Xero is not connected. Leave saves in Team Calendar only, so it
                appears on calendars but does not create payroll leave or enter
                the Leave approval queue.
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

        {xeroConnectionState !== "connected" &&
        xeroConnectionState !== "not_connected" ? (
          <XeroRecoveryNotice reason={xeroConnectionState} />
        ) : null}

        <PlansClient
          canRecoverSubmit={isAdminOrOwner(orgRole)}
          canViewTeam={canViewTeam}
          filters={filters}
          nextCursor={recordsResult.value.nextCursor}
          organisationId={organisationId}
          orgQueryValue={orgQueryValue}
          records={records}
          totalCount={recordsResult.value.totalCount}
          window={{
            from: recordsResult.value.window.from?.toISOString() ?? null,
            to: recordsResult.value.window.to?.toISOString() ?? null,
          }}
          xeroConnectionState={xeroConnectionState}
        />

        {records.length === 0 && (
          <EmptyState
            actionSlot={
              filtersAreDefault(filters) ? (
                <div className="flex flex-wrap justify-center gap-2">
                  <Button asChild>
                    <Link href={withOrg("/plans/new", orgQueryValue)}>
                      Create a plan
                    </Link>
                  </Button>
                  {!filters.allHistory && (
                    <Button asChild variant="outline">
                      <Link
                        href={withOrg(
                          "/plans?tab=my&allHistory=true",
                          orgQueryValue
                        )}
                      >
                        View all history
                      </Link>
                    </Button>
                  )}
                </div>
              ) : undefined
            }
            description={emptyStateDescription(filters)}
            title={
              filtersAreDefault(filters)
                ? "No plans in this window"
                : "No matching plans"
            }
          />
        )}
      </div>
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
    failedAction:
      record.failedAction === "submit" ||
      record.failedAction === "withdraw" ||
      record.failedAction === "approve" ||
      record.failedAction === "decline"
        ? record.failedAction
        : null,
    id: record.id,
    personName: `${record.person.firstName} ${record.person.lastName}`,
    recordType: record.recordType,
    sourceType: record.sourceType,
    startsAt: record.startsAt.toISOString(),
    submissionResolutionPending: record.submissionResolutionPending,
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
    filters.allHistory === false &&
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
    return "There are no leave or availability records in the current window. Create a plan or view all history.";
  }
  return "Change the filters or clear the date and status selections to see more leave and availability records.";
}
