import { auth } from "@repo/auth/server";
import {
  getRunDetail,
  listTenantSummaries,
  type SyncMonitorRole,
} from "@repo/availability";
import type { Metadata } from "next";
import { FetchErrorState } from "@/components/states/fetch-error-state";
import { PermissionDeniedState } from "@/components/states/permission-denied-state";
import {
  PermissionDeniedError,
  requirePageRole,
} from "@/lib/auth/require-page-role";
import { requireActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";
import { Header } from "../../components/header";
import { SyncRunDetailClient } from "./sync-run-detail-client";

export const metadata: Metadata = {
  description: "View details of a synchronisation run.",
  title: "Sync run detail | LeaveSync",
};

interface SyncRunDetailPageProperties {
  params: Promise<{ runId: string }>;
  searchParams: Promise<{ org?: string }>;
}

const SyncRunDetailPage = async ({
  params,
  searchParams,
}: SyncRunDetailPageProperties) => {
  const [{ runId }, { org }] = await Promise.all([params, searchParams]);

  try {
    await requirePageRole("org:admin");
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      return (
        <>
          <Header page="Sync run detail" />
          <div className="flex flex-1 flex-col p-6 pt-0">
            <PermissionDeniedState />
          </div>
        </>
      );
    }
    throw error;
  }

  const { orgRole } = await auth();
  const role = effectiveRole(orgRole);
  if (!role) {
    return (
      <>
        <Header page="Sync run detail" />
        <div className="flex flex-1 flex-col p-6 pt-0">
          <PermissionDeniedState />
        </div>
      </>
    );
  }

  const { clerkOrgId, organisationId } = await requireActiveOrgPageContext(org);
  const [detailResult, summariesResult] = await Promise.all([
    getRunDetail({
      actingRole: role,
      clerkOrgId,
      organisationId,
      runId,
    }),
    listTenantSummaries({
      actingRole: role,
      clerkOrgId,
      organisationId,
    }),
  ]);

  return (
    <>
      <Header organisationId={organisationId} page="Sync run detail" />
      <main className="flex flex-1 flex-col gap-6 p-6 pt-0">
        {detailResult.ok && summariesResult.ok ? (
          <SyncRunDetailClient
            detail={detailResult.value}
            organisationId={organisationId}
            tenantSummary={
              summariesResult.value.find(
                (summary) =>
                  summary.xeroTenantId === detailResult.value.run.xeroTenantId
              ) ?? null
            }
          />
        ) : (
          <FetchErrorState entityName="sync run detail" />
        )}
      </main>
    </>
  );
};

function effectiveRole(
  role: string | null | undefined
): SyncMonitorRole | null {
  if (role === "org:owner") {
    return "owner";
  }
  if (role === "org:admin") {
    return "admin";
  }
  return null;
}

export default SyncRunDetailPage;
