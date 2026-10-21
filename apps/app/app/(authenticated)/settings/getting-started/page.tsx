import { requireOrg } from "@repo/auth/helpers";
import type { ClerkOrgId } from "@repo/core";
import { withTenantDb } from "@repo/database";
import type { Metadata } from "next";
import { OnboardingChecklist } from "@/components/onboarding/onboarding-checklist";
import { requirePageRole } from "@/lib/auth/require-page-role";
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
  await requirePageRole("org:admin");

  const { org } = await searchParams;
  const clerkOrgId = (await requireOrg()) as ClerkOrgId;
  const { onboarding, orgQueryValue } = await withTenantDb(
    clerkOrgId,
    async (db) => {
      const { organisationId, orgQueryValue: preparedOrgQueryValue } =
        await resolveActiveOrgPageContext(clerkOrgId, org, db);
      const preparedOnboarding = await loadOnboardingState(
        { clerkOrgId, organisationId },
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
