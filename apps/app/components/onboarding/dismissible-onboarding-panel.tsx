"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { useEffect, useMemo, useState } from "react";
import type { OnboardingState } from "@/lib/server/load-onboarding-state";
import { OnboardingChecklist } from "./onboarding-checklist";

interface DismissibleOnboardingPanelProps {
  clerkOrgId: string;
  onboarding: OnboardingState;
  organisationId: string;
  orgQueryValue: string | null;
  userId: string;
}

export function DismissibleOnboardingPanel({
  clerkOrgId,
  onboarding,
  organisationId,
  orgQueryValue,
  userId,
}: DismissibleOnboardingPanelProps) {
  const storageKey = useMemo(
    () =>
      `team-calendar:onboarding-dismissed:${clerkOrgId}:${organisationId}:${userId}`,
    [clerkOrgId, organisationId, userId]
  );
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    setIsDismissed(window.localStorage.getItem(storageKey) === "true");
  }, [storageKey]);

  if (onboarding.isComplete || isDismissed) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            window.localStorage.setItem(storageKey, "true");
            setIsDismissed(true);
          }}
          size="sm"
          variant="ghost"
        >
          Dismiss onboarding
        </Button>
      </div>
      <OnboardingChecklist
        orgQueryValue={orgQueryValue}
        state={onboarding}
        variant="dashboard"
      />
    </div>
  );
}
