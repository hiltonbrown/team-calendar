import { requireAccount } from "@repo/auth/helpers";
import { getCurrentUser } from "@repo/auth/server";
import type { AccountId } from "@repo/core";
import { TENANT_READ_TRANSACTION_OPTIONS, withTenantDb } from "@repo/database";
import { resolveAccountCompanies } from "@repo/database/queries/account-companies";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import { ModeToggle } from "@repo/design-system/components/mode-toggle";
import { Separator } from "@repo/design-system/components/ui/separator";
import { SidebarTrigger } from "@repo/design-system/components/ui/sidebar";
import { getUnreadCount, listRecentUnread } from "@repo/notifications";
import { type ReactNode, Suspense } from "react";
import { NotificationsBell } from "@/components/notifications/bell";
import { CommandMenuTrigger } from "./command-menu-trigger";
import { CompanySelector } from "./company-selector";
import { CustomUserButton } from "./custom-user-button";

interface HeaderProps {
  children?: ReactNode;
  organisationId?: string | null;
  page: string;
  pages?: string[];
  showCompanySelector?: boolean;
}

export const Header = async ({
  page,
  children,
  organisationId,
  showCompanySelector = true,
}: HeaderProps) => {
  assertNoTenantTransaction("Header");
  const { bell, companies } = await loadHeaderData(showCompanySelector);

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between gap-4 border-border border-b bg-background px-4 shadow-[var(--elev-sticky)]">
      <div className="flex items-center gap-3">
        <SidebarTrigger
          className="-ml-0.5 size-7"
          style={{ color: "var(--muted-foreground)" }}
        />
        <Separator className="h-4 opacity-40" orientation="vertical" />
        <h1 className="font-semibold text-title-md">{page}</h1>
      </div>

      <div className="flex items-center gap-2">
        {showCompanySelector ? (
          <CompanySelector
            companies={companies}
            organisationId={organisationId}
          />
        ) : null}
        {children}
        <CommandMenuTrigger />
        {bell ? (
          <NotificationsBell
            initialRecent={bell.recent}
            initialUnreadCount={bell.unreadCount}
            key={bell.accountId}
          />
        ) : null}
        <ModeToggle />
        <Suspense
          fallback={
            <div className="h-7 w-7 animate-pulse rounded-full bg-[var(--sidebar-accent)] motion-reduce:animate-none" />
          }
        >
          <CustomUserButton />
        </Suspense>
      </div>
    </header>
  );
};

async function loadHeaderData(showCompanySelector: boolean) {
  try {
    const [user, rawAccountId] = await Promise.all([
      getCurrentUser(),
      requireAccount(),
    ]);
    // requireAccount supplies the authenticated Account identifier.
    const accountId = rawAccountId as AccountId;
    return await withTenantDb(
      accountId,
      async (db) => {
        const companies = showCompanySelector
          ? (await resolveAccountCompanies(accountId, db)).map(
              ({ id, name }) => ({ id, name })
            )
          : [];
        if (!user) {
          return { bell: null, companies };
        }
        const countResult = await getUnreadCount(
          { accountId, userId: user.id },
          db
        );
        const recentResult = await listRecentUnread(
          { accountId, limit: 3, userId: user.id },
          db
        );
        return {
          bell: {
            accountId,
            recent: recentResult.ok
              ? recentResult.value.map((item) => ({
                  actionUrl: item.actionUrl,
                  body: item.body,
                  createdAt: item.createdAt.toISOString(),
                  iconKey: item.iconKey,
                  id: item.id,
                  organisationId: item.organisationId,
                  organisationName: item.organisationName,
                  title: item.title,
                }))
              : [],
            unreadCount: countResult.ok ? countResult.value : 0,
          },
          companies,
        };
      },
      TENANT_READ_TRANSACTION_OPTIONS
    );
  } catch {
    return { bell: null, companies: [] };
  }
}
