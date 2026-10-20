import { requireOrg } from "@repo/auth/helpers";
import { auth, currentUser } from "@repo/auth/server";
import type { ClerkOrgId } from "@repo/core";
import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { PermissionDeniedState } from "@/components/states/permission-denied-state";
import { requirePageRole } from "@/lib/auth/require-page-role";
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
  // Clerk authentication finishes before dashboard preparation opens its tenant scope.
  const clerkOrgId = (await requireOrg()) as ClerkOrgId;
  const companyIds =
    typeof params.companyIds === "string"
      ? params.companyIds.split(",").filter(Boolean)
      : params.companyIds;
  const [{ orgRole, userId }, user] = await Promise.all([
    auth(),
    currentUser(),
  ]);

  return (
    <>
      <Header organisationId={orgParam} page="Dashboard" />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0 sm:gap-6 sm:p-6 sm:pt-0">
        {userId && user ? (
          <Suspense fallback={<DashboardSkeleton />}>
            <DashboardBody
              clerkOrgId={clerkOrgId}
              companyIds={companyIds}
              orgParam={orgParam}
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
