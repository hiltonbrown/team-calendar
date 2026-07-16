import { requireOrg } from "@repo/auth/helpers";
import { currentUser } from "@repo/auth/server";
import type { ClerkOrgId } from "@repo/core";
import { listOrganisationsByClerkOrg } from "@repo/database/src/queries/organisations";
import { ModeToggle } from "@repo/design-system/components/mode-toggle";
import { Separator } from "@repo/design-system/components/ui/separator";
import { SidebarTrigger } from "@repo/design-system/components/ui/sidebar";
import { getUnreadCount, listRecentUnread } from "@repo/notifications";
import { type ReactNode, Suspense } from "react";
import { NotificationsBell } from "@/components/notifications/bell";
import { CommandMenuTrigger } from "./command-menu-trigger";
import { CustomUserButton } from "./custom-user-button";

interface HeaderProps {
  children?: ReactNode;
  organisationId?: string | null;
  page: string;
  pages?: string[];
}

export const Header = async ({
  page,
  children,
  organisationId,
}: HeaderProps) => {
  const bell = await loadBellData(organisationId);

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between gap-4 border-border border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center gap-3">
        <SidebarTrigger
          className="-ml-0.5 size-7"
          style={{ color: "var(--muted-foreground)" }}
        />
        <Separator className="h-4 opacity-40" orientation="vertical" />
        <h1 className="font-semibold text-[0.9375rem] tracking-[-0.01em]">
          {page}
        </h1>
      </div>

      <div className="flex items-center gap-2">
        {children}
        <CommandMenuTrigger />
        {bell && (
          <NotificationsBell
            initialRecent={bell.recent}
            initialUnreadCount={bell.unreadCount}
            organisationId={bell.organisationId}
          />
        )}
        <ModeToggle />
        <Suspense
          fallback={
            <div className="h-7 w-7 animate-pulse rounded-full bg-[var(--sidebar-accent)]" />
          }
        >
          <CustomUserButton />
        </Suspense>
      </div>
    </header>
  );
};

async function loadBellData(organisationId?: string | null): Promise<{
  organisationId: string;
  recent: Array<{
    actionUrl: string | null;
    body: string;
    createdAt: string;
    iconKey: string;
    id: string;
    title: string;
  }>;
  unreadCount: number;
} | null> {
  try {
    const [user, rawClerkOrgId] = await Promise.all([
      currentUser(),
      requireOrg(),
    ]);
    // requireOrg guarantees this string is the active Clerk Organisation ID.
    const clerkOrgId = rawClerkOrgId as ClerkOrgId;
    if (!user) {
      return null;
    }
    let resolvedOrganisationId = organisationId ?? null;
    if (!resolvedOrganisationId) {
      const organisations = await listOrganisationsByClerkOrg(clerkOrgId);
      resolvedOrganisationId = organisations.ok
        ? (organisations.value[0]?.id ?? null)
        : null;
    }
    if (!resolvedOrganisationId) {
      return null;
    }
    const [countResult, recentResult] = await Promise.all([
      getUnreadCount({
        clerkOrgId,
        organisationId: resolvedOrganisationId,
        userId: user.id,
      }),
      listRecentUnread({
        clerkOrgId,
        organisationId: resolvedOrganisationId,
        userId: user.id,
        limit: 3,
      }),
    ]);
    return {
      organisationId: resolvedOrganisationId,
      recent: recentResult.ok
        ? recentResult.value.map((item) => ({
            actionUrl: item.actionUrl,
            body: item.body,
            createdAt: item.createdAt.toISOString(),
            iconKey: item.iconKey,
            id: item.id,
            title: item.title,
          }))
        : [],
      unreadCount: countResult.ok ? countResult.value : 0,
    };
  } catch {
    return null;
  }
}
