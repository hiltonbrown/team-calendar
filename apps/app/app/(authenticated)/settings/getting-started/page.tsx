import { requireAccount } from "@repo/auth/helpers";
import type { AccountId } from "@repo/core";
import { withTenantDb } from "@repo/database";
import type { Metadata } from "next";
import { OnboardingChecklist } from "@/components/onboarding/onboarding-checklist";
import { requirePagePermission } from "@/lib/auth/require-page-permission";
import { loadOnboardingState } from "@/lib/server/load-onboarding-state";
import { resolveActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";
import { SettingsSectionHeader } from "../components/settings-section-header";

export const metadata: Metadata = {
  description: "Recommended next steps after setting up this organisation.",
  title: "Getting Started - Settings - Team Calendar",
};

interface GettingStartedSettingsPageProps {
  searchParams: Promise<{ org?: string }>;
}

const GettingStartedSettingsPage = async ({
  searchParams,
}: GettingStartedSettingsPageProps) => {
  await requirePagePermission({ settings: ["update"] });

  const { org } = await searchParams;
  const accountId = (await requireAccount()) as AccountId;
  const { onboarding, orgQueryValue } = await withTenantDb(
    accountId,
    async (db) => {
      const { organisationId, orgQueryValue: preparedOrgQueryValue } =
        await resolveActiveOrgPageContext(accountId, org, db);
      const preparedOnboarding = await loadOnboardingState(
        { accountId, organisationId },
        db
      );
      return {
        onboarding: preparedOnboarding,
        orgQueryValue: preparedOrgQueryValue,
      };
    }
  );

  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        description="Recommended next steps after setup. They help your team see availability, and none of them block normal use."
        title="Getting Started"
      />
      <OnboardingChecklist orgQueryValue={orgQueryValue} state={onboarding} />
    </div>
  );
};

export default GettingStartedSettingsPage;
