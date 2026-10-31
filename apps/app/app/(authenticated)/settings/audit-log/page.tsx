import { requireAccount } from "@repo/auth/helpers";
import {
  getCurrentUser,
  getSession,
  listAccountAuthAuditEvents,
} from "@repo/auth/server";
import { getAuditEventDetail, listAuditLogEvents } from "@repo/availability";
import type { AccountId, OrganisationId } from "@repo/core";
import { withTenantDb } from "@repo/database";
import { resolveAccountCompanies } from "@repo/database/queries/account-companies";
import type { Metadata } from "next";
import { z } from "zod";
import { requirePagePermission } from "@/lib/auth/require-page-permission";
import {
  AuditLogClient,
  type CombinedAuditEventDetail,
  type CombinedAuditEventItem,
} from "./audit-log-client";

export const metadata: Metadata = {
  description: "All system and user actions for this organisation.",
  title: "Audit Log - Settings - Team Calendar",
};

interface AuditLogPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

interface CombinedCursor {
  authCursor?: string | null;
  domainCursor?: string | null;
}

function parseCombinedCursor(raw?: string): CombinedCursor {
  if (!raw) {
    return {};
  }
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(json);
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as CombinedCursor;
    }
  } catch {
    return { domainCursor: raw };
  }
  return { domainCursor: raw };
}

function resolveAuthEntityType(eventType: string): string {
  if (eventType.startsWith("user.")) {
    return "user";
  }
  if (eventType.startsWith("membership.")) {
    return "membership";
  }
  if (eventType.startsWith("invitation.")) {
    return "invitation";
  }
  return "account";
}

async function loadDomainAuditData(input: {
  accountId: AccountId;
  cursor?: string | null;
  filters: {
    actionPrefix?: string;
    dateFrom?: Date;
    dateTo?: Date;
    searchEntityId?: string;
  };
  org: string | undefined;
  role: "admin" | "owner";
  userId: string;
}) {
  return withTenantDb(input.accountId, async (db) => {
    const companies = await resolveAccountCompanies(input.accountId, db);
    if (companies.length === 0) {
      return {
        details: {},
        events: [],
        nextCursor: null,
        organisationId: null,
      };
    }
    const matching =
      input.org &&
      z.string().uuid().safeParse(input.org).success &&
      companies.find((c) => c.id === input.org);
    const scopedOrganisationId = (matching ? matching.id : companies[0]?.id) as
      | OrganisationId
      | undefined;
    if (!scopedOrganisationId) {
      return {
        details: {},
        events: [],
        nextCursor: null,
        organisationId: null,
      };
    }

    const preparedListResult = await listAuditLogEvents(
      {
        accountId: input.accountId,
        actingRole: input.role,
        actingUserId: input.userId,
        filters: input.filters,
        organisationId: scopedOrganisationId,
        pagination: {
          cursor: input.cursor ?? undefined,
          pageSize: 25,
        },
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
    const detailResults: Awaited<ReturnType<typeof getAuditEventDetail>>[] = [];
    for (const eventId of detailIds) {
      detailResults.push(
        await getAuditEventDetail(
          {
            accountId: input.accountId,
            actingRole: input.role,
            actingUserId: input.userId,
            eventId,
            organisationId: scopedOrganisationId,
          },
          db
        )
      );
    }
    const preparedDetails: Record<
      string,
      { afterValue: unknown; beforeValue: unknown }
    > = {};
    for (const result of detailResults) {
      if (result.ok) {
        preparedDetails[result.value.id] = {
          afterValue: result.value.afterValue,
          beforeValue: result.value.beforeValue,
        };
      }
    }

    return {
      details: preparedDetails,
      events: preparedListResult.value.events,
      nextCursor: preparedListResult.value.nextCursor,
      organisationId: scopedOrganisationId,
    };
  });
}

function combineAuditEvents(
  authAuditResult: Awaited<ReturnType<typeof listAccountAuthAuditEvents>>,
  domainData: Awaited<ReturnType<typeof loadDomainAuditData>>
) {
  const authEvents: CombinedAuditEventItem[] = authAuditResult.ok
    ? authAuditResult.value.events.map((evt) => ({
        action: evt.eventType,
        actorDisplay: evt.actorUserId
          ? `User ${evt.actorUserId.slice(0, 8)}`
          : "System",
        actorUserId: evt.actorUserId,
        createdAt: new Date(evt.createdAt),
        entityId: evt.targetUserId ?? evt.accountId,
        entityType: resolveAuthEntityType(evt.eventType),
        hasBeforeAfter: Boolean(evt.before || evt.after),
        id: evt.id,
        metadata: evt.requestId ? { requestId: evt.requestId } : {},
        source: "auth" as const,
      }))
    : [];

  const domainEvents: CombinedAuditEventItem[] = domainData.events.map(
    (evt) => ({
      action: evt.action,
      actorDisplay: evt.actorDisplay,
      actorUserId: evt.actorUserId,
      createdAt: evt.createdAt,
      entityId: evt.entityId,
      entityType: evt.entityType,
      hasBeforeAfter: evt.hasBeforeAfter,
      id: evt.id,
      ipAddress: evt.ipAddress,
      metadata: evt.metadata,
      source: "domain" as const,
      userAgent: evt.userAgent,
    })
  );

  const combinedEvents = [...domainEvents, ...authEvents].sort((a, b) => {
    const timeDiff = b.createdAt.getTime() - a.createdAt.getTime();
    if (timeDiff !== 0) {
      return timeDiff;
    }
    return b.id.localeCompare(a.id);
  });

  const combinedDetails: Record<string, CombinedAuditEventDetail> = {};
  for (const [id, detail] of Object.entries(domainData.details)) {
    combinedDetails[id] = {
      afterValue: detail.afterValue,
      beforeValue: detail.beforeValue,
      id,
      source: "domain",
    };
  }
  if (authAuditResult.ok) {
    for (const evt of authAuditResult.value.events) {
      if (evt.before || evt.after) {
        combinedDetails[evt.id] = {
          afterValue: evt.after,
          beforeValue: evt.before,
          id: evt.id,
          source: "auth",
        };
      }
    }
  }

  let nextCursor: string | null = null;
  const authNextCursor = authAuditResult.ok
    ? authAuditResult.value.nextCursor
    : null;
  const domainNextCursor = domainData.nextCursor;
  if (authNextCursor || domainNextCursor) {
    nextCursor = Buffer.from(
      JSON.stringify({
        authCursor: authNextCursor ?? null,
        domainCursor: domainNextCursor ?? null,
      })
    ).toString("base64url");
  }

  return {
    details: combinedDetails,
    events: combinedEvents,
    nextCursor,
  };
}

const AuditLogPage = async ({ searchParams }: AuditLogPageProps) => {
  await requirePagePermission({ audit: ["read"] });

  const [{ role: sessionRole }, user, params] = await Promise.all([
    getSession().then(
      (currentSession) =>
        currentSession ?? {
          accountId: null,
          role: null,
          sessionId: null,
          userId: null,
        }
    ),
    getCurrentUser(),
    searchParams,
  ]);
  const org = firstValue(params.org);
  const accountId = (await requireAccount()) as AccountId;
  const role = sessionRole === "owner" ? "owner" : "admin";

  if (!user) {
    throw new Error("User not found.");
  }

  const filters = {
    actionPrefix: firstValue(params.actionPrefix),
    dateFrom: dateValue(params.dateFrom),
    dateTo: dateValue(params.dateTo),
    searchEntityId: firstValue(params.entityId),
  };
  const rawCursor = firstValue(params.cursor);
  const combinedCursor = parseCombinedCursor(rawCursor);

  const [authAuditResult, domainData] = await Promise.all([
    listAccountAuthAuditEvents({
      cursor: combinedCursor.authCursor ?? undefined,
      limit: 25,
    }),
    loadDomainAuditData({
      accountId,
      cursor: combinedCursor.domainCursor,
      filters,
      org,
      role,
      userId: user.id,
    }),
  ]);

  const { details, events, nextCursor } = combineAuditEvents(
    authAuditResult,
    domainData
  );

  return (
    <AuditLogClient
      details={details}
      events={events}
      filters={{
        actionPrefix: filters.actionPrefix ?? "",
        dateFrom: firstValue(params.dateFrom) ?? "",
        dateTo: firstValue(params.dateTo) ?? "",
        searchEntityId: filters.searchEntityId ?? "",
      }}
      nextCursor={nextCursor}
      organisationId={domainData.organisationId}
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
