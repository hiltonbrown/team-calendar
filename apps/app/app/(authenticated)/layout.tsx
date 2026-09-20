import { requireOrg } from "@repo/auth/helpers";
import { auth, currentUser } from "@repo/auth/server";
import type { ClerkOrgId } from "@repo/core";
import { listOrganisationsByClerkOrg } from "@repo/database/queries/organisations";
import {
  SidebarInset,
  SidebarProvider,
} from "@repo/design-system/components/ui/sidebar";
import type { ReactNode } from "react";
import { CommandMenu } from "./components/command-menu";
import { NotificationsProvider } from "./components/notifications-provider";
import { GlobalSidebar } from "./components/sidebar";

interface AppLayoutProperties {
  readonly children: ReactNode;
}

const AppLayout = async ({ children }: AppLayoutProperties) => {
  const user = await currentUser();
  const { redirectToSignIn } = await auth();
  const betaFeature = process.env.SHOW_BETA_FEATURE === "true";

  if (!user) {
    return redirectToSignIn();
  }

  let organisationId: string | null = null;
  try {
    // requireOrg guarantees this string is the active Clerk Organisation ID.
    const clerkOrgId = (await requireOrg()) as ClerkOrgId;
    const organisations = await listOrganisationsByClerkOrg(clerkOrgId);
    organisationId = organisations.ok
      ? (organisations.value[0]?.id ?? null)
      : null;
  } catch {
    organisationId = null;
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

export default AppLayout;
