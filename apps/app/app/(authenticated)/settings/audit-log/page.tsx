import { requireOrg } from "@repo/auth/helpers";
import { auth, currentUser } from "@repo/auth/server";
import {
  type AuditEventDetail,
  getAuditEventDetail,
  listAuditLogEvents,
} from "@repo/availability";
import type { ClerkOrgId } from "@repo/core";
import { withTenantDb } from "@repo/database";
import type { Metadata } from "next";
import { requirePageRole } from "@/lib/auth/require-page-role";
import { resolveActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";
import { AuditLogClient } from "./audit-log-client";

export const metadata: Metadata = {
  description: "All system and user actions for this organisation.",
  title: "Audit Log - Settings - Team Calendar",
};

interface AuditLogPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const AuditLogPage = async ({ searchParams }: AuditLogPageProps) => {
  await requirePageRole("org:admin");

  const [{ orgRole }, user, params] = await Promise.all([
    auth(),
    currentUser(),
    searchParams,
  ]);
  const org = firstValue(params.org);
  const clerkOrgId = (await requireOrg()) as ClerkOrgId;
  const role = orgRole === "org:owner" ? "owner" : "admin";

  if (!user) {
    throw new Error("User not found.");
  }

  const filters = {
    actionPrefix: firstValue(params.actionPrefix),
    dateFrom: dateValue(params.dateFrom),
    dateTo: dateValue(params.dateTo),
    searchEntityId: firstValue(params.entityId),
  };
  const cursor = firstValue(params.cursor);

  const { listResult, details, organisationId } = await withTenantDb(
    clerkOrgId,
    async (db) => {
      const { organisationId: scopedOrganisationId } =
        await resolveActiveOrgPageContext(clerkOrgId, org, db);
      const preparedListResult = await listAuditLogEvents(
        {
          actingRole: role,
          actingUserId: user.id,
          clerkOrgId,
          filters,
          organisationId: scopedOrganisationId,
          pagination: { cursor, pageSize: 50 },
        },
        db
      );

      if (!preparedListResult.ok) {
        throw new Error(preparedListResult.error.message);
      }

      const detailIds = preparedListResult.value.events
        .filter((event) => event.hasBeforeAfter)
        .slice(0, 10)
        .map((event) => event.id);
      const detailResults: Awaited<ReturnType<typeof getAuditEventDetail>>[] =
        [];
      for (const eventId of detailIds) {
        detailResults.push(
          await getAuditEventDetail(
            {
              actingRole: role,
              actingUserId: user.id,
              clerkOrgId,
              eventId,
              organisationId: scopedOrganisationId,
            },
            db
          )
        );
      }
      const preparedDetails = new Map<string, AuditEventDetail>();
      for (const result of detailResults) {
        if (result.ok) {
          preparedDetails.set(result.value.id, result.value);
        }
      }

      return {
        details: Object.fromEntries(preparedDetails),
        listResult: preparedListResult,
        organisationId: scopedOrganisationId,
      };
    }
  );

  return (
    <AuditLogClient
      details={details}
      events={listResult.value.events}
      filters={{
        actionPrefix: filters.actionPrefix ?? "",
        dateFrom: firstValue(params.dateFrom) ?? "",
        dateTo: firstValue(params.dateTo) ?? "",
        searchEntityId: filters.searchEntityId ?? "",
      }}
      nextCursor={listResult.value.nextCursor}
      organisationId={organisationId}
    />
  );
};

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function dateValue(value: string | string[] | undefined): Date | undefined {
  const stringValue = firstValue(value);
  if (!stringValue) {
    return;
  }
  const date = new Date(stringValue);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export default AuditLogPage;
