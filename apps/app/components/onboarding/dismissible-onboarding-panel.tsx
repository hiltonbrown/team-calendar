"use client";

import { Button } from "@repo/design-system/components/ui/button";
import Link from "next/link";
import { useEffect, useState } from "react";
import { withOrg } from "@/lib/navigation/org-url";
import type { OnboardingState } from "@/lib/server/load-onboarding-state";

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
  const storageKey = `team-calendar:onboarding-dismissed:${clerkOrgId}:${organisationId}:${userId}`;
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    setIsDismissed(window.localStorage.getItem(storageKey) === "true");
  }, [storageKey]);

  if (onboarding.isComplete || isDismissed) {
    return null;
  }

  const nextStep = onboarding.steps.find((step) => step.status === "next");

  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-muted p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h2 className="font-semibold">Continue setup</h2>
        <p className="mt-1 text-muted-foreground text-sm">
          {onboarding.completedRequiredCount} of {onboarding.requiredCount}{" "}
          required steps complete
          {nextStep ? `, next: ${nextStep.title}.` : "."}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="secondary">
          <Link href={withOrg("/settings/getting-started", orgQueryValue)}>
            Review setup
          </Link>
        </Button>
        <Button
          onClick={() => {
            window.localStorage.setItem(storageKey, "true");
            setIsDismissed(true);
          }}
          size="sm"
          variant="ghost"
        >
          Dismiss
        </Button>
      </div>
    </section>
  );
}
