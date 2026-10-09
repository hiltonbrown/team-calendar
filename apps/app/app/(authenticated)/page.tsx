import { auth, currentUser } from "@repo/auth/server";
import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardLiveUpdates } from "@/components/dashboard/dashboard-live-updates";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { PermissionDeniedState } from "@/components/states/permission-denied-state";
import { requirePageRole } from "@/lib/auth/require-page-role";
import { requireActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";
import { Header } from "./components/header";
import { DashboardBody } from "./dashboard-body";
import { parseDashboardWeekParam } from "./dashboard-week-param";

export const metadata: Metadata = {
  description: "Who is in this week, coverage and requests waiting for you.",
  title: "Dashboard | Team Calendar",
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

  return (
    <>
      <Header organisationId={organisationId} page="Dashboard" />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0 sm:gap-6 sm:p-6 sm:pt-0">
        <DashboardLiveUpdates organisationId={organisationId} />
        {userId && user ? (
          <Suspense fallback={<DashboardSkeleton />}>
            <DashboardBody
              clerkOrgId={clerkOrgId}
              organisationId={organisationId}
              orgQueryValue={orgQueryValue}
              orgRole={orgRole}
              userId={userId}
              weekAnchor={parseDashboardWeekParam(params.week)}
            />
          </Suspense>
        ) : (
          <PermissionDeniedState />
        )}
      </div>
    </>
  );
}
