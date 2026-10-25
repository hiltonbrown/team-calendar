import { requireAccount } from "@repo/auth/helpers";
import { getCurrentUser } from "@repo/auth/server";
import type { AccountId } from "@repo/core";
import { TENANT_READ_TRANSACTION_OPTIONS, withTenantDb } from "@repo/database";
import {
  listAllTypes,
  listForUser,
  listPreferences,
  type NotificationCategory,
} from "@repo/notifications";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";
import { FetchErrorState } from "@/components/states/fetch-error-state";
import { requirePagePermission } from "@/lib/auth/require-page-permission";
import { resolveActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";
import { parseFilterParams } from "@/lib/url-state/parse-filter-params";
import { Header } from "../components/header";
import { NotificationsClient } from "./notifications-client";

export const metadata: Metadata = {
  description: "View notifications and manage delivery preferences.",
  title: "Notifications | Team Calendar",
};

interface NotificationsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const FilterSchema = z.object({
  category: z
    .preprocess(
      arrayParam,
      z.array(z.enum(["leave_lifecycle", "approval_flow", "sync", "system"]))
    )
    .default([]),
  cursor: z.string().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  focus: z.string().optional(),
  tab: z.enum(["feed", "preferences"]).default("feed"),
  type: z.preprocess(arrayParam, z.array(z.string())).default([]),
  unreadOnly: z
    .preprocess((value) => value === "true" || value === true, z.boolean())
    .default(false),
});

const NotificationsPage = async ({ searchParams }: NotificationsPageProps) => {
  await requirePagePermission({ notifications: ["read"] });
  const params = await searchParams;
  const { org, ...filterParams } = params;
  const orgParam = Array.isArray(org) ? org[0] : org;
  const user = await getCurrentUser();
  if (!user) {
    redirect("/");
  }

  const filters = parseFilterParams(filterParams, FilterSchema) ?? {
    category: [],
    tab: "feed" as const,
    type: [],
    unreadOnly: false,
  };
  const notificationFilters = {
    category: filters.category as NotificationCategory[],
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    type: filters.type,
    unreadOnly: filters.unreadOnly,
  };

  // Clerk supplied the authenticated account identifier.
  const accountId = (await requireAccount()) as AccountId;
  const {
    organisationId,
    orgQueryValue,
    preferenceCompanyName,
    notificationsResult,
    preferencesResult,
  } = await withTenantDb(
    accountId,
    async (db) => {
      const {
        organisationId: scopedOrganisationId,
        orgQueryValue: preparedOrgQueryValue,
      } = await resolveActiveOrgPageContext(accountId, orgParam, db);
      const company = await db.organisation.findFirst({
        select: { name: true },
        where: { account_id: accountId, id: scopedOrganisationId },
      });
      const preparedNotificationsResult = await listForUser(
        {
          accountId,
          filters: notificationFilters,
          pagination: { cursor: filters.cursor, pageSize: 25 },
          userId: user.id,
        },
        db
      );
      const preparedPreferencesResult = await listPreferences(
        { accountId, organisationId: scopedOrganisationId, userId: user.id },
        db
      );
      return {
        notificationsResult: preparedNotificationsResult,
        organisationId: scopedOrganisationId,
        orgQueryValue: preparedOrgQueryValue,
        preferenceCompanyName: company?.name ?? "Selected company",
        preferencesResult: preparedPreferencesResult,
      };
    },
    TENANT_READ_TRANSACTION_OPTIONS
  );

  return (
    <>
      <Header
        organisationId={organisationId}
        page="Notifications"
        showCompanySelector={filters.tab === "preferences"}
      />
      <div className="flex flex-1 flex-col gap-6 p-6 pt-0">
        {notificationsResult.ok && preferencesResult.ok ? (
          <NotificationsClient
            filters={{
              category: filters.category,
              cursor: filters.cursor ?? null,
              dateFrom: filters.dateFrom?.toISOString() ?? null,
              dateTo: filters.dateTo?.toISOString() ?? null,
              focus: filters.focus ?? null,
              tab: filters.tab,
              type: filters.type,
              unreadOnly: filters.unreadOnly,
            }}
            key={JSON.stringify([
              organisationId,
              filters,
              notificationsResult.value.unreadCount,
              notificationsResult.value.notifications.map((item) => [
                item.id,
                item.readAt?.toISOString() ?? null,
              ]),
            ])}
            nextCursor={notificationsResult.value.nextCursor}
            notifications={notificationsResult.value.notifications.map(
              (item) => ({
                ...item,
                createdAt: item.createdAt.toISOString(),
                readAt: item.readAt?.toISOString() ?? null,
              })
            )}
            notificationTypes={listAllTypes()}
            organisationId={organisationId}
            orgQueryValue={orgQueryValue}
            preferenceCompanyName={preferenceCompanyName}
            preferences={preferencesResult.value}
            unreadCount={notificationsResult.value.unreadCount}
          />
        ) : (
          <FetchErrorState entityName="notifications" />
        )}
      </div>
    </>
  );
};

export default NotificationsPage;

function arrayParam(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => String(item).split(",")).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(",").filter(Boolean);
  }
  return [];
}
