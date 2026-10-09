import { requireOrg } from "@repo/auth/helpers";
import { auth, currentUser } from "@repo/auth/server";
import { isOnboardingAdmin, loadWelcomeEligibility } from "@repo/availability";
import type { ClerkOrgId } from "@repo/core";
import { getOnboardingRecord } from "@repo/database/queries/onboarding";
import { listOrganisationsByClerkOrg } from "@repo/database/queries/organisations";
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
  const user = await currentUser();
  const { orgRole, redirectToSignIn } = await auth();
  const betaFeature = process.env.SHOW_BETA_FEATURE === "true";

  if (!user) {
    return redirectToSignIn();
  }

  let clerkOrgId: ClerkOrgId | null = null;
  let organisationId: string | null = null;
  try {
    // requireOrg guarantees this string is the active Clerk Organisation ID.
    clerkOrgId = (await requireOrg()) as ClerkOrgId;
    const organisations = await listOrganisationsByClerkOrg(clerkOrgId);
    organisationId = organisations.ok
      ? (organisations.value[0]?.id ?? null)
      : null;
  } catch {
    organisationId = null;
  }

  const firstRunRedirect = clerkOrgId
    ? await resolveFirstRunRedirect({
        clerkOrgId,
        organisationId,
        orgRole,
        userId: user.id,
      })
    : null;
  if (firstRunRedirect) {
    redirect(firstRunRedirect);
  }

  return (
    <NotificationsProvider organisationId={organisationId}>
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
async function resolveFirstRunRedirect(input: {
  clerkOrgId: ClerkOrgId;
  organisationId: string | null;
  orgRole: string | null | undefined;
  userId: string;
}): Promise<"/onboarding" | "/welcome" | null> {
  const pathname = (await headers()).get("x-pathname") ?? "/";
  const isAdmin = isOnboardingAdmin(input.orgRole);
  let wizardCompleted = false;
  let welcomeEligible = false;
  if (isAdmin && input.organisationId) {
    const record = await getOnboardingRecord(
      input.clerkOrgId,
      input.organisationId
    );
    // A failed lookup must not lock admins out of the app.
    wizardCompleted = record.ok ? record.value.completedAt !== null : true;
  } else if (!isAdmin && input.organisationId) {
    const eligibility = await loadWelcomeEligibility({
      actingRole: input.orgRole,
      clerkOrgId: input.clerkOrgId,
      organisationId: input.organisationId,
      userId: input.userId,
    });
    welcomeEligible = eligibility.ok && eligibility.value.eligible;
  }
  return resolveOnboardingRedirect({
    orgRole: input.orgRole,
    pathname,
    welcomeEligible,
    wizardCompleted,
  });
}

export default AppLayout;
