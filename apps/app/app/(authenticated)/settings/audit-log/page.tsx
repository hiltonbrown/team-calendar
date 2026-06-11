import { auth, currentUser } from "@repo/auth/server";
import {
  type AuditEventDetail,
  getAuditEventDetail,
  listAuditLogEvents,
} from "@repo/availability";
import type { Metadata } from "next";
import { requirePageRole } from "@/lib/auth/require-page-role";
import { requireActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";
import { AuditLogClient } from "./audit-log-client";

export const metadata: Metadata = {
  description: "All system and user actions for this organisation.",
  title: "Audit Log - Settings - LeaveSync",
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
  const { clerkOrgId, organisationId } = await requireActiveOrgPageContext(org);
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

  const listResult = await listAuditLogEvents({
    actingRole: role,
    actingUserId: user.id,
    clerkOrgId,
    filters,
    organisationId,
    pagination: { pageSize: 50 },
  });

  if (!listResult.ok) {
    throw new Error(listResult.error.message);
  }

  const detailIds = listResult.value.events
    .filter((event) => event.hasBeforeAfter)
    .slice(0, 10)
    .map((event) => event.id);
  const detailResults = await Promise.all(
    detailIds.map((eventId) =>
      getAuditEventDetail({
        actingRole: role,
        actingUserId: user.id,
        clerkOrgId,
        eventId,
        organisationId,
      })
    )
  );
  const details = new Map<string, AuditEventDetail>();
  for (const result of detailResults) {
    if (result.ok) {
      details.set(result.value.id, result.value);
    }
  }

  return (
    <AuditLogClient
      details={Object.fromEntries(details)}
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
