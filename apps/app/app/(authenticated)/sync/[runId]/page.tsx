import { requireAccount } from "@repo/auth/helpers";
import { getSession } from "@repo/auth/server";
import {
  getRunDetail,
  listTenantSummaries,
  type SyncMonitorRole,
} from "@repo/availability";
import type { AccountId } from "@repo/core";
import { TENANT_READ_TRANSACTION_OPTIONS, withTenantDb } from "@repo/database";
import type { Metadata } from "next";
import { FetchErrorState } from "@/components/states/fetch-error-state";
import { PermissionDeniedState } from "@/components/states/permission-denied-state";
import {
  PermissionDeniedError,
  requirePagePermission,
} from "@/lib/auth/require-page-permission";
import { resolveActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";
import { Header } from "../../components/header";
import { SyncRunDetailClient } from "./sync-run-detail-client";

export const metadata: Metadata = {
  description: "View details of a synchronisation run.",
  title: "Sync run detail | Team Calendar",
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
    await requirePagePermission({ xero: ["sync"] });
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

  const { role: sessionRole } = (await getSession()) ?? {
    accountId: null,
    role: null,
    sessionId: null,
    userId: null,
  };
  const role = effectiveRole(sessionRole);
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

  // Authentication supplied the authenticated account identifier.
  const accountId = (await requireAccount()) as AccountId;
  const { organisationId, orgQueryValue, detailResult, summariesResult } =
    await withTenantDb(
      accountId,
      async (db) => {
        const {
          organisationId: scopedOrganisationId,
          orgQueryValue: preparedOrgQueryValue,
        } = await resolveActiveOrgPageContext(accountId, org, db);
        const preparedDetailResult = await getRunDetail(
          {
            accountId,
            actingRole: role,
            organisationId: scopedOrganisationId,
            runId,
          },
          db
        );
        const preparedSummariesResult = await listTenantSummaries(
          {
            accountId,
            actingRole: role,
            organisationId: scopedOrganisationId,
          },
          db
        );
        return {
          detailResult: preparedDetailResult,
          organisationId: scopedOrganisationId,
          orgQueryValue: preparedOrgQueryValue,
          summariesResult: preparedSummariesResult,
        };
      },
      TENANT_READ_TRANSACTION_OPTIONS
    );

  return (
    <>
      <Header organisationId={organisationId} page="Sync run detail" />
      <div className="flex flex-1 flex-col gap-6 p-6 pt-0">
        {detailResult.ok && summariesResult.ok ? (
          <SyncRunDetailClient
            detail={detailResult.value}
            organisationId={organisationId}
            orgQueryValue={orgQueryValue}
            tenantSummary={
              summariesResult.value.find(
                (summary) =>
                  summary.connectionId === detailResult.value.run.connectionId
              ) ?? null
            }
          />
        ) : (
          <FetchErrorState entityName="sync run detail" />
        )}
      </div>
    </>
  );
};

function effectiveRole(
  role: string | null | undefined
): SyncMonitorRole | null {
  if (role === "owner") {
    return "owner";
  }
  if (role === "admin") {
    return "admin";
  }
  return null;
}

export default SyncRunDetailPage;
