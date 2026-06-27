import {
  createDashboardCache,
  getAdminView,
  getEmployeeView,
  getManagerView,
  resolveDashboardRole,
} from "@repo/availability";
import type { ClerkOrgId, OrganisationId } from "@repo/core";
import { database, scopedQuery } from "@repo/database";
import { AdminEmptyView } from "@/components/dashboard/admin-empty-view";
import { AdminView } from "@/components/dashboard/admin-view";
import { EmployeeView } from "@/components/dashboard/employee-view";
import { ManagerView } from "@/components/dashboard/manager-view";
import { ViewerView } from "@/components/dashboard/viewer-view";
import { DismissibleOnboardingPanel } from "@/components/onboarding/dismissible-onboarding-panel";
import { FetchErrorState } from "@/components/states/fetch-error-state";
import { loadOnboardingState } from "@/lib/server/load-onboarding-state";

interface DashboardBodyProps {
  clerkOrgId: ClerkOrgId;
  organisationId: OrganisationId;
  orgQueryValue: string | null;
  orgRole: string | null | undefined;
  userId: string;
}

/**
 * Data-heavy half of the dashboard. Rendered inside a Suspense boundary so the
 * app shell paints immediately while role resolution and the batched view query
 * stream in behind a region-shaped skeleton.
 */
export async function DashboardBody({
  clerkOrgId,
  orgQueryValue,
  orgRole,
  organisationId,
  userId,
}: DashboardBodyProps) {
  const [actingPerson, roleResult, onboarding] = await Promise.all([
    database.person.findFirst({
      where: {
        ...scopedQuery(clerkOrgId, organisationId),
        archived_at: null,
        clerk_user_id: userId,
      },
      select: { id: true },
    }),
    resolveDashboardRole({
      clerkOrgId,
      orgRole,
      organisationId,
      userId,
    }),
    loadOnboardingState({ clerkOrgId, organisationId, userId }),
  ]);

  if (!roleResult.ok) {
    return <FetchErrorState entityName="dashboard" />;
  }

  const canManageOnboarding =
    roleResult.value === "owner" || roleResult.value === "admin";
  const cache = createDashboardCache();
  const content = await renderDashboard({
    actingPersonId: actingPerson?.id ?? null,
    cache,
    clerkOrgId,
    onboarding,
    organisationId,
    orgQueryValue,
    role: roleResult.value,
    userId,
  });

  return (
    <>
      {canManageOnboarding ? (
        <DismissibleOnboardingPanel
          clerkOrgId={clerkOrgId}
          onboarding={onboarding}
          organisationId={organisationId}
          orgQueryValue={orgQueryValue}
          userId={userId}
        />
      ) : null}
      {content}
    </>
  );
}

interface RenderDashboardInput {
  actingPersonId: string | null;
  cache: ReturnType<typeof createDashboardCache>;
  clerkOrgId: string;
  onboarding: Awaited<ReturnType<typeof loadOnboardingState>>;
  organisationId: string;
  orgQueryValue: string | null;
  role: "admin" | "employee" | "manager" | "owner" | "viewer";
  userId: string;
}

async function renderDashboard({
  role,
  actingPersonId,
  cache,
  clerkOrgId,
  onboarding,
  organisationId,
  orgQueryValue,
  userId,
}: RenderDashboardInput) {
  if (!actingPersonId) {
    if (role === "owner" || role === "admin") {
      return (
        <AdminEmptyView
          hasActiveXeroConnection={onboarding.hasActiveXeroConnection}
          orgQueryValue={orgQueryValue}
          roleLabel={role === "owner" ? "Owner" : "Admin"}
        />
      );
    }
    return <ViewerView />;
  }

  if (role === "viewer") {
    return <ViewerView />;
  }

  if (role === "owner" || role === "admin") {
    const result = await getAdminView(
      {
        actingRole: role,
        clerkOrgId,
        organisationId,
        personId: actingPersonId,
        userId,
      },
      cache
    );

    if (!result.ok) {
      return <FetchErrorState entityName="dashboard" />;
    }

    return (
      <AdminView
        orgQueryValue={orgQueryValue}
        personId={actingPersonId}
        view={result.value}
      />
    );
  }

  if (role === "manager") {
    const result = await getManagerView(
      {
        actingRole: role,
        clerkOrgId,
        organisationId,
        personId: actingPersonId,
        userId,
      },
      cache
    );

    if (!result.ok) {
      return <FetchErrorState entityName="dashboard" />;
    }

    return (
      <ManagerView
        orgQueryValue={orgQueryValue}
        personId={actingPersonId}
        view={result.value}
      />
    );
  }

  const result = await getEmployeeView(
    {
      actingRole: "employee",
      clerkOrgId,
      organisationId,
      personId: actingPersonId,
      userId,
    },
    cache
  );

  if (!result.ok) {
    return <FetchErrorState entityName="dashboard" />;
  }

  return (
    <EmployeeView
      orgQueryValue={orgQueryValue}
      personId={actingPersonId}
      view={result.value}
    />
  );
}
