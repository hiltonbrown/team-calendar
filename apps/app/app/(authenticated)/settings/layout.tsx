import { auth } from "@repo/auth/server";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { requireActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";
import { Header } from "../components/header";
import { SettingsNav } from "./components/settings-nav";

interface SettingsLayoutProps {
  readonly children: ReactNode;
}

const SettingsLayout = async ({ children }: SettingsLayoutProps) => {
  const { orgId, orgRole } = await auth();

  if (!orgId) {
    redirect("/");
  }

  const isAdminOrOwner = orgRole === "org:owner" || orgRole === "org:admin";

  if (!isAdminOrOwner) {
    redirect("/");
  }

  const { organisationId } = await requireActiveOrgPageContext();

  return (
    <>
      <Header page="Settings" />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <SettingsNav orgQueryValue={organisationId} />
        <main className="min-w-0 flex-1 overflow-y-auto px-4 pb-6 sm:px-6 lg:pt-0">
          {children}
        </main>
      </div>
    </>
  );
};

export default SettingsLayout;
