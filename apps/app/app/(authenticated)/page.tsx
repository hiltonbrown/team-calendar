import { auth, currentUser } from "@repo/auth/server";
import {
  createDashboardCache,
  getAdminView,
  getEmployeeView,
  getManagerView,
  resolveDashboardRole,
} from "@repo/availability";
import { database, scopedQuery } from "@repo/database";
import type { Metadata } from "next";
import { AdminEmptyView } from "@/components/dashboard/admin-empty-view";
import { AdminView } from "@/components/dashboard/admin-view";
import { DashboardLiveUpdates } from "@/components/dashboard/dashboard-live-updates";
import { EmployeeView } from "@/components/dashboard/employee-view";
import { ManagerView } from "@/components/dashboard/manager-view";
import { ViewerView } from "@/components/dashboard/viewer-view";
import { DismissibleOnboardingPanel } from "@/components/onboarding/dismissible-onboarding-panel";
import { FetchErrorState } from "@/components/states/fetch-error-state";
import { PermissionDeniedState } from "@/components/states/permission-denied-state";
import { requirePageRole } from "@/lib/auth/require-page-role";
import { loadOnboardingState } from "@/lib/server/load-onboarding-state";
import { requireActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";
import { Header } from "./components/header";

export const metadata: Metadata = {
  title: "Dashboard | Team Calendar",
  description: "Role-aware overview of leave, availability, and sync status.",
};

interface DashboardPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  await requirePageRole("org:viewer");

  const params = await searchParams;
  const orgParam = typeof params.org === "string" ? params.org : undefined;
  const { clerkOrgId, organisationId, orgQueryValue } =
    await requireActiveOrgPageContext(orgParam);
  const [{ orgRole, userId }, user] = await Promise.all([
    auth(),
    currentUser(),
  ]);

  if (!(userId && user)) {
    return (
      <>
        <Header organisationId={organisationId} page="Dashboard" />
        <main className="flex flex-1 flex-col gap-6 p-6 pt-0">
          <PermissionDeniedState />
        </main>
      </>
    );
  }

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
    return (
      <>
        <Header organisationId={organisationId} page="Dashboard" />
        <main className="flex flex-1 flex-col gap-6 p-6 pt-0">
          <FetchErrorState entityName="dashboard" />
        </main>
      </>
    );
  }

  const cache = createDashboardCache();
  const content = await renderDashboard({
    actingPersonId: actingPerson?.id ?? null,
    cache,
    clerkOrgId,
    organisationId,
    orgQueryValue,
    onboarding,
    role: roleResult.value,
    userId,
  });
  const canManageOnboarding =
    roleResult.value === "owner" || roleResult.value === "admin";

  return (
    <>
      <Header organisationId={organisationId} page="Dashboard" />
      <main className="flex flex-1 flex-col gap-6 p-6 pt-0">
        <DashboardLiveUpdates organisationId={organisationId} />
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
      </main>
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
