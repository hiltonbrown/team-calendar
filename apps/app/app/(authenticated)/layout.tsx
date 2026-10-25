import { requireAccount } from "@repo/auth/helpers";
import { getCurrentUser, getSession } from "@repo/auth/server";
import { isOnboardingAdmin, loadWelcomeEligibility } from "@repo/availability";
import type { AccountId } from "@repo/core";
import { type TenantDb, withTenantDb } from "@repo/database";
import { getOnboardingRecord } from "@repo/database/queries/onboarding";
import { listOrganisationsByAccount } from "@repo/database/queries/organisations";
import {
  SidebarInset,
  SidebarProvider,
} from "@repo/design-system/components/ui/sidebar";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { resolveOnboardingRedirect } from "@/lib/server/onboarding-gate";
import { CommandMenu } from "./components/command-menu";
import { NotificationsProvider } from "./components/notifications-provider";
import { GlobalSidebar } from "./components/sidebar";

interface AppLayoutProperties {
  readonly children: ReactNode;
}

const AppLayout = async ({ children }: AppLayoutProperties) => {
  const user = await getCurrentUser();
  const { role: sessionRole } = (await getSession()) ?? {
    accountId: null,
    role: null,
    sessionId: null,
    userId: null,
  };
  const pathname = (await headers()).get("x-pathname") ?? "/";
  const betaFeature = process.env.SHOW_BETA_FEATURE === "true";

  if (!user) {
    return redirect("/sign-in");
  }

  let accountId: AccountId | null = null;
  try {
    // requireAccount guarantees this string is the active Account ID.
    accountId = (await requireAccount()) as AccountId;
  } catch {
    accountId = null;
  }
  let firstRunRedirect: "/onboarding" | "/welcome" | null = null;
  if (accountId) {
    const account = accountId;
    try {
      const prepared = await withTenantDb(account, async (db) => {
        const organisations = await listOrganisationsByAccount(account, db);
        const scopedOrganisationId = organisations.ok
          ? (organisations.value[0]?.id ?? null)
          : null;
        const preparedFirstRunRedirect = await resolveFirstRunRedirect(
          {
            accountId: account,
            organisationId: scopedOrganisationId,
            role: sessionRole,
            userId: user.id,
          },
          pathname,
          db
        );
        return {
          firstRunRedirect: preparedFirstRunRedirect,
          organisationId: scopedOrganisationId,
        };
      });
      ({ firstRunRedirect } = prepared);
    } catch {
      firstRunRedirect = null;
    }
  }

  if (firstRunRedirect) {
    redirect(firstRunRedirect);
  }

  return (
    <NotificationsProvider enabled={accountId !== null} key={accountId}>
      <a
        className="fixed top-3 left-3 z-50 -translate-y-24 rounded-xl bg-primary px-4 py-2 font-medium text-primary-foreground transition-transform focus:translate-y-0"
        href="#main-content"
      >
        Skip to main content
      </a>
      <CommandMenu />
      <SidebarProvider className="h-svh">
        <GlobalSidebar>
          <SidebarInset
            className="overflow-y-auto"
            id="main-content"
            tabIndex={-1}
          >
            {betaFeature && (
              <aside
                aria-label="Beta feature notification"
                className="m-4 rounded-full bg-accent-container p-1.5 text-center text-label-lg text-on-accent-container"
                role="status"
              >
                Beta feature now available
              </aside>
            )}
            {children}
          </SidebarInset>
        </GlobalSidebar>
      </SidebarProvider>
    </NotificationsProvider>
  );
};

// Owners and admins finish the setup wizard before using the app; linked
// members see the welcome once. Lookups only run for the role that needs them.
async function resolveFirstRunRedirect(
  input: {
    accountId: AccountId;
    organisationId: string | null;
    role: string | null | undefined;
    userId: string;
  },
  pathname: string,
  db: TenantDb
): Promise<"/onboarding" | "/welcome" | null> {
  const isAdmin = isOnboardingAdmin(input.role);
  let wizardCompleted = false;
  let welcomeEligible = false;
  if (isAdmin && input.organisationId) {
    const record = await getOnboardingRecord(
      input.accountId,
      input.organisationId,
      db
    );
    // A failed lookup must not lock admins out of the app.
    wizardCompleted = record.ok ? record.value.completedAt !== null : true;
  } else if (!isAdmin && input.organisationId) {
    const eligibility = await loadWelcomeEligibility(
      {
        accountId: input.accountId,
        actingRole: input.role,
        organisationId: input.organisationId,
        userId: input.userId,
      },
      db
    );
    welcomeEligible = eligibility.ok && eligibility.value.eligible;
  }
  return resolveOnboardingRedirect({
    pathname,
    role: input.role,
    welcomeEligible,
    wizardCompleted,
  });
}

export default AppLayout;
