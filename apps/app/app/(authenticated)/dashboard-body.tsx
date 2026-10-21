import {
  buildTimelineWeek,
  createDashboardCache,
  getAdminView,
  getCalendarRange,
  getDashboardApprovalQueue,
  getEmployeeView,
  getManagerView,
  resolveDashboardRole,
  selectCalendarCompanies,
} from "@repo/availability";
import type { ClerkOrgId } from "@repo/core";
import {
  resolveAccountCompanies,
  TENANT_READ_TRANSACTION_OPTIONS,
  type TenantDb,
  withTenantDb,
} from "@repo/database";
import { notFound, redirect } from "next/navigation";
import { CompanyFilter } from "@/components/calendar/company-filter";
import { AdminEmptyView } from "@/components/dashboard/admin-empty-view";
import { AdminView } from "@/components/dashboard/admin-view";
import { ApprovalRows } from "@/components/dashboard/approval-rows";
import { DashboardLiveUpdates } from "@/components/dashboard/dashboard-live-updates";
import { EmployeeView } from "@/components/dashboard/employee-view";
import { ManagerView } from "@/components/dashboard/manager-view";
import { TimelineSection } from "@/components/dashboard/timeline-section";
import { ViewerView } from "@/components/dashboard/viewer-view";
import { FetchErrorState } from "@/components/states/fetch-error-state";

interface DashboardBodyProps {
  clerkOrgId: ClerkOrgId;
  companyIds?: string[];
  orgParam?: string;
  orgRole: string | null | undefined;
  userId: string;
  weekAnchor?: string;
}

export async function DashboardBody({
  clerkOrgId,
  orgParam,
  companyIds,
  orgRole,
  userId,
  weekAnchor,
}: DashboardBodyProps) {
  const prepared = await withTenantDb(
    clerkOrgId,
    (db) =>
      prepareDashboardData(
        { clerkOrgId, companyIds, orgParam, orgRole, userId, weekAnchor },
        db
      ),
    TENANT_READ_TRANSACTION_OPTIONS
  );
  const now = new Date();
  const common = { now, orgQueryValue: prepared.orgQueryValue };
  const personId = prepared.actingPersonId ?? "";
  // Every query has finished and the request transaction is closed before rendering.
  return (
    <>
      <CompanyFilter
        companies={prepared.companies}
        companyIds={prepared.companyIds}
      />
      <DashboardLiveUpdates organisationIds={prepared.organisationIds} />
      {"timeline" in prepared ? (
        <TimelineSection
          {...common}
          state={prepared.timeline}
          viewerRole={prepared.kind === "admin-empty" ? "admin" : "employee"}
        />
      ) : null}
      {"approvalQueue" in prepared && prepared.approvalQueue ? (
        <ApprovalRows
          {...common}
          state={prepared.approvalQueue}
          timezone={
            "timeline" in prepared && prepared.timeline.status === "ready"
              ? prepared.timeline.data.timezone
              : "UTC"
          }
          title="Waiting for approval"
        />
      ) : null}
      {renderDashboardRoleView(prepared, common, personId)}
    </>
  );
}

type DashboardRole = Extract<
  Awaited<ReturnType<typeof resolveDashboardRole>>,
  { ok: true }
>["value"];
interface DashboardBase {
  actingPersonId: string | null;
  companies: Awaited<ReturnType<typeof resolveAccountCompanies>>;
  companyIds: string[] | undefined;
  organisationIds: string[];
  orgQueryValue: string | null;
}
async function prepareDashboardData(
  {
    clerkOrgId,
    orgParam,
    companyIds,
    orgRole,
    userId,
    weekAnchor,
  }: DashboardBodyProps,
  db: TenantDb
) {
  const companies = await resolveAccountCompanies(clerkOrgId, db);
  if (companies.length === 0) {
    redirect("/onboarding");
  }
  const selectedIds = companyIds ?? (orgParam ? [orgParam] : undefined);
  const selection = selectCalendarCompanies(
    { companyIds: selectedIds },
    companies
  );
  if (!selection.ok) {
    notFound();
  }
  const actingPerson = await db.person.findFirst({
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
    select: { id: true, organisation_id: true },
    where: {
      archived_at: null,
      clerk_org_id: clerkOrgId,
      clerk_user_id: userId,
      organisation_id: { in: companies.map((company) => company.id) },
    },
  });
  const organisationId = actingPerson?.organisation_id ?? companies[0]?.id;
  if (!organisationId) {
    redirect("/onboarding");
  }
  const roleResult = await resolveDashboardRole(
    { clerkOrgId, organisationId, orgRole, userId },
    db
  );
  const base = {
    actingPersonId: actingPerson?.id ?? null,
    companies,
    companyIds: selectedIds,
    organisationIds: selection.value.map((company) => company.id),
    orgQueryValue: selectedIds?.length === 1 ? (selectedIds[0] ?? null) : null,
  };
  if (!roleResult.ok) {
    return { ...base, kind: "error" as const };
  }
  const role = roleResult.value;
  if (!actingPerson || role === "viewer") {
    return prepareUnlinkedDashboard(
      base,
      { clerkOrgId, userId, weekAnchor },
      role,
      db
    );
  }

  const input = {
    actingRole: role,
    clerkOrgId,
    companyIds: selectedIds,
    organisationId,
    personId: actingPerson.id,
    userId,
    weekAnchor,
  };
  return prepareLinkedDashboard(base, input, role, db);
}
async function prepareUnlinkedDashboard(
  base: DashboardBase,
  {
    clerkOrgId,
    userId,
    weekAnchor,
  }: Pick<DashboardBodyProps, "clerkOrgId" | "userId" | "weekAnchor">,
  role: DashboardRole,
  db: TenantDb
) {
  const calendar = await getCalendarRange(
    {
      actingPersonId: base.actingPersonId,
      actingUserId: userId,
      anchorDate: weekAnchor ? new Date(`${weekAnchor}T12:00:00Z`) : new Date(),
      clerkOrgId,
      companyIds: base.companyIds,
      filters: {
        approvalStatus: ["approved"],
        includeDrafts: false,
        recordTypeCategory: "all",
      },
      role: role === "owner" || role === "admin" ? role : "viewer",
      scope: { type: "all_teams" },
      view: "week",
    },
    db
  );
  const timeline = calendar.ok
    ? {
        data: buildTimelineWeek({
          actingPersonId: base.actingPersonId,
          onlyPeopleWithEntries: false,
          range: calendar.value,
          rowLimit: 10,
          today: new Date(),
        }),
        status: "ready" as const,
      }
    : { message: calendar.error.message, status: "error" as const };
  const approvalQueue =
    role === "owner" || role === "admin"
      ? await getDashboardApprovalQueue(
          {
            actingRole: role,
            clerkOrgId,
            companyIds: base.companyIds,
            personId: null,
            userId,
          },
          db
        )
      : null;
  return {
    ...base,
    approvalQueue,
    kind:
      role === "owner" || role === "admin"
        ? ("admin-empty" as const)
        : ("viewer" as const),
    timeline,
  };
}
async function prepareLinkedDashboard(
  base: DashboardBase,
  input: Parameters<typeof getEmployeeView>[0],
  role: DashboardRole,
  db: TenantDb
) {
  const cache = createDashboardCache();
  if (role === "admin" || role === "owner") {
    const result = await getAdminView(input, cache, db);
    return result.ok
      ? { ...base, kind: "admin" as const, view: result.value }
      : { ...base, kind: "error" as const };
  }
  if (role === "manager") {
    const result = await getManagerView(input, cache, db);
    return result.ok
      ? { ...base, kind: "manager" as const, view: result.value }
      : { ...base, kind: "error" as const };
  }
  const result = await getEmployeeView(input, cache, db);
  return result.ok
    ? { ...base, kind: "employee" as const, view: result.value }
    : { ...base, kind: "error" as const };
}

function renderDashboardRoleView(
  prepared: Awaited<ReturnType<typeof prepareDashboardData>>,
  common: { now: Date; orgQueryValue: string | null },
  personId: string
) {
  switch (prepared.kind) {
    case "admin":
      return <AdminView {...common} personId={personId} view={prepared.view} />;
    case "manager":
      return (
        <ManagerView {...common} personId={personId} view={prepared.view} />
      );
    case "employee":
      return (
        <EmployeeView {...common} personId={personId} view={prepared.view} />
      );
    case "admin-empty":
      return <AdminEmptyView {...common} />;
    case "viewer":
      return <ViewerView {...common} />;
    default:
      return <FetchErrorState entityName="dashboard" />;
  }
}
