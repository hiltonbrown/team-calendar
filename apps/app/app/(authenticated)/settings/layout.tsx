import { hasPermission as can } from "@repo/auth/permissions";
import { getSession } from "@repo/auth/server";
import type { AccountId } from "@repo/core";
import { withTenantDb } from "@repo/database";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { resolveActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";
import { Header } from "../components/header";
import { SettingsNav } from "./components/settings-nav";

interface SettingsLayoutProps {
  readonly children: ReactNode;
}

const SettingsLayout = async ({ children }: SettingsLayoutProps) => {
  const { accountId: sessionAccountId, role: sessionRole } =
    (await getSession()) ?? {
      accountId: null,
      role: null,
      sessionId: null,
      userId: null,
    };

  if (!sessionAccountId) {
    redirect("/");
  }

  const isAdminOrOwner = can(sessionRole, { settings: ["update"] });

  if (!isAdminOrOwner) {
    redirect("/");
  }

  const accountId = sessionAccountId as AccountId;
  const { organisationId } = await withTenantDb(accountId, (db) =>
    resolveActiveOrgPageContext(accountId, undefined, db)
  );

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
