import { auth } from "@repo/auth/server";
import {
  listRuns,
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
import { parseFilterParams } from "@/lib/url-state/parse-filter-params";
import { Header } from "../components/header";
import { SyncRunFiltersSchema } from "./_schemas";
import { SyncClient } from "./sync-client";

export const metadata: Metadata = {
  description: "Monitor Xero synchronisation health.",
  title: "Sync health | Team Calendar",
};

interface SyncPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const SyncPage = async ({ searchParams }: SyncPageProps) => {
  const params = await searchParams;

  try {
    await requirePageRole("org:admin");
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      return (
        <>
          <Header page="Sync health" />
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
        <Header page="Sync health" />
        <div className="flex flex-1 flex-col p-6 pt-0">
          <PermissionDeniedState />
        </div>
      </>
    );
  }

  const { clerkOrgId, organisationId } = await requireActiveOrgPageContext(
    typeof params.org === "string" ? params.org : undefined
  );
  const parsedFilters = parseFilterParams(params, SyncRunFiltersSchema) ?? {};
  const filters = {
    dateFrom: parsedFilters.dateFrom
      ? new Date(`${parsedFilters.dateFrom}T00:00:00.000Z`)
      : undefined,
    dateTo: parsedFilters.dateTo
      ? new Date(`${parsedFilters.dateTo}T23:59:59.999Z`)
      : undefined,
    runType: parsedFilters.runType,
    status: parsedFilters.status,
    triggerType: parsedFilters.triggerType,
    xeroTenantId: parsedFilters.xeroTenantId,
  };

  const [summariesResult, runsResult] = await Promise.all([
    listTenantSummaries({
      actingRole: role,
      clerkOrgId,
      organisationId,
    }),
    listRuns({
      actingRole: role,
      clerkOrgId,
      filters,
      organisationId,
      pagination: {
        cursor: parsedFilters.cursor ?? null,
        pageSize: 50,
      },
    }),
  ]);

  const hasError = !(summariesResult.ok && runsResult.ok);

  return (
    <>
      <Header organisationId={organisationId} page="Sync health" />
      <main className="flex flex-1 flex-col gap-6 p-6 pt-0">
        <div>
          <p className="text-muted-foreground text-sm">
            Monitor Xero data flow and reconciliation
          </p>
        </div>
        {hasError ? (
          <FetchErrorState entityName="sync health" />
        ) : (
          <SyncClient
            filters={parsedFilters}
            nextCursor={runsResult.value.nextCursor}
            organisationId={organisationId}
            runs={runsResult.value.runs}
            summaries={summariesResult.value}
          />
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

export default SyncPage;
