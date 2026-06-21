import { requireOrg } from "@repo/auth/helpers";
import { auth, currentUser } from "@repo/auth/server";
import type { ClerkOrgId } from "@repo/core";
import { listOrganisationsByClerkOrg } from "@repo/database/src/queries/organisations";
import {
  SidebarInset,
  SidebarProvider,
} from "@repo/design-system/components/ui/sidebar";
import type { ReactNode } from "react";
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
      <SidebarProvider className="h-svh">
        <GlobalSidebar>
          <SidebarInset className="overflow-y-auto">
            {betaFeature && (
              <div className="m-4 rounded-full bg-accent-container p-1.5 text-center text-on-accent-container text-sm">
                Beta feature now available
              </div>
            )}
            {children}
          </SidebarInset>
        </GlobalSidebar>
      </SidebarProvider>
    </NotificationsProvider>
  );
};

export default AppLayout;
