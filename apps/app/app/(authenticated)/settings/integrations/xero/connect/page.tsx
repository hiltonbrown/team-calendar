import { getSession } from "@repo/auth/server";
import { getPendingXeroOAuthSession } from "@repo/xero";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePagePermission } from "@/lib/auth/require-page-permission";
import { SettingsSectionHeader } from "../../../components/settings-section-header";
import { XeroConnectClient } from "./connect-client";

export const metadata: Metadata = {
  description: "Finish connecting a Xero payroll organisation.",
  title: "Connect Xero - Settings - Team Calendar",
};

interface XeroConnectPageProps {
  searchParams: Promise<{ session?: string }>;
}

export default async function XeroConnectPage({
  searchParams,
}: XeroConnectPageProps) {
  await requirePagePermission({ xero: ["manage"] });

  const [{ accountId: sessionAccountId, userId }, { session }] =
    await Promise.all([
      getSession().then(
        (currentSession) =>
          currentSession ?? {
            accountId: null,
            role: null,
            sessionId: null,
            userId: null,
          }
      ),
      searchParams,
    ]);
  if (!(sessionAccountId && session && userId)) {
    notFound();
  }

  const pending = await getPendingXeroOAuthSession({
    accountId: sessionAccountId,
    sessionId: session,
    userId,
  });
  if (!pending.ok) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        description="Select the Xero payroll files to add or reconnect in this account."
        title="Connect Xero"
      />
      <XeroConnectClient
        organisations={pending.value.organisations}
        payrollEntityAllowance={pending.value.payrollEntityAllowance}
        presetOrganisationId={pending.value.presetOrganisationId}
        sessionId={pending.value.sessionId}
        tenants={pending.value.tenants}
      />
    </div>
  );
}
