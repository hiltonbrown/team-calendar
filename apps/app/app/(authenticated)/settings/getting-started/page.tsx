import { auth } from "@repo/auth/server";
import type { Metadata } from "next";
import { OnboardingChecklist } from "@/components/onboarding/onboarding-checklist";
import { requirePageRole } from "@/lib/auth/require-page-role";
import { loadOnboardingState } from "@/lib/server/load-onboarding-state";
import { requireActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";
import { SettingsSectionHeader } from "../components/settings-section-header";

export const metadata: Metadata = {
  description: "Review optional setup steps for this organisation.",
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
  const { clerkOrgId, organisationId, orgQueryValue } =
    await requireActiveOrgPageContext(org);
  const { userId } = await auth();
  const onboarding = await loadOnboardingState({
    clerkOrgId,
    organisationId,
    userId,
  });

  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        description="Return to setup guidance at any time. These steps help you publish availability, but they do not block normal app use."
        title="Getting Started"
      />
      <OnboardingChecklist
        orgQueryValue={orgQueryValue}
        state={onboarding}
        variant="settings"
      />
    </div>
  );
};

export default GettingStartedSettingsPage;
