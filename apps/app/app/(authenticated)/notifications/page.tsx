import { currentUser } from "@repo/auth/server";
import {
  listAllTypes,
  listForUser,
  listPreferences,
  type NotificationCategory,
} from "@repo/notifications";
import { NotificationsProvider } from "@repo/notifications/components/provider";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";
import { FetchErrorState } from "@/components/states/fetch-error-state";
import { requirePageRole } from "@/lib/auth/require-page-role";
import { getPublicApiUrl } from "@/lib/public-api-url";
import { requireActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";
import { parseFilterParams } from "@/lib/url-state/parse-filter-params";
import { Header } from "../components/header";
import { NotificationsClient } from "./notifications-client";

export const metadata: Metadata = {
  title: "Notifications | Team Calendar",
  description: "View notifications and manage delivery preferences.",
};

interface NotificationsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const FilterSchema = z.object({
  tab: z.enum(["feed", "preferences"]).default("feed"),
  unreadOnly: z
    .preprocess((value) => value === "true" || value === true, z.boolean())
    .default(false),
  type: z.preprocess(arrayParam, z.array(z.string())).default([]),
  category: z
    .preprocess(
      arrayParam,
      z.array(z.enum(["leave_lifecycle", "approval_flow", "sync", "system"]))
    )
    .default([]),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  focus: z.string().optional(),
  cursor: z.string().optional(),
});

const NotificationsPage = async ({ searchParams }: NotificationsPageProps) => {
  await requirePageRole("org:viewer");
  const params = await searchParams;
  const { org, ...filterParams } = params;
  const orgParam = Array.isArray(org) ? org[0] : org;
  const { clerkOrgId, organisationId, orgQueryValue } =
    await requireActiveOrgPageContext(orgParam);
  const user = await currentUser();
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
    unreadOnly: filters.unreadOnly,
    type: filters.type,
    category: filters.category as NotificationCategory[],
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  };

  const [notificationsResult, preferencesResult] = await Promise.all([
    listForUser({
      clerkOrgId,
      organisationId,
      userId: user.id,
      filters: notificationFilters,
      pagination: { cursor: filters.cursor, pageSize: 25 },
    }),
    listPreferences({
      clerkOrgId,
      organisationId,
      userId: user.id,
    }),
  ]);

  const streamUrl = getPublicApiUrl(
    `/api/notifications/stream?organisationId=${encodeURIComponent(organisationId)}`
  );

  return (
    <>
      <Header organisationId={organisationId} page="Notifications" />
      <main className="flex flex-1 flex-col gap-6 p-6 pt-0">
        {notificationsResult.ok && preferencesResult.ok ? (
          <NotificationsProvider streamUrl={streamUrl}>
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
              preferences={preferencesResult.value}
              unreadCount={notificationsResult.value.unreadCount}
            />
          </NotificationsProvider>
        ) : (
          <FetchErrorState entityName="notifications" />
        )}
      </main>
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
