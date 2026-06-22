import { Button } from "@repo/design-system/components/ui/button";
import Link from "next/link";
import { withOrg } from "@/lib/navigation/org-url";
import type {
  OnboardingState,
  OnboardingStepStatus,
} from "@/lib/server/load-onboarding-state";

interface OnboardingChecklistProps {
  orgQueryValue: string | null;
  state: OnboardingState;
  variant: "dashboard" | "settings";
}

export function OnboardingChecklist({
  state,
  orgQueryValue,
  variant,
}: OnboardingChecklistProps) {
  const isDashboard = variant === "dashboard";

  return (
    <section className="rounded-2xl bg-muted p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-medium text-muted-foreground text-xs uppercase tracking-widest">
            Getting started
          </p>
          <h2 className="mt-1 font-semibold text-2xl tracking-tight">
            Publish availability when you are ready
          </h2>
          <p className="mt-2 max-w-2xl text-muted-foreground text-sm">
            Team Calendar works without Xero or completed onboarding. Use these
            steps when they are useful, or continue using the dashboard.
          </p>
        </div>
        <div className="rounded-xl bg-background/70 px-4 py-3 text-sm">
          <span className="font-semibold">
            {state.completedRequiredCount}/{state.requiredCount}
          </span>{" "}
          required steps complete
        </div>
      </div>

      <div className="mt-6 grid gap-3">
        {state.steps.map((step) => (
          <div
            className="flex flex-col gap-4 rounded-2xl bg-background/70 p-4 sm:flex-row sm:items-center sm:justify-between"
            key={step.id}
          >
            <div className="flex gap-3">
              <StatusBadge status={step.status} />
              <div>
                <h3 className="font-semibold text-base">{step.title}</h3>
                <p className="mt-1 text-muted-foreground text-sm">
                  {step.description}
                </p>
              </div>
            </div>
            <Button
              asChild
              size={isDashboard ? "sm" : "default"}
              variant="outline"
            >
              <Link href={withOrg(step.ctaHref, orgQueryValue)}>
                {step.ctaLabel}
              </Link>
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}

function StatusBadge({ status }: { status: OnboardingStepStatus }) {
  const label = {
    complete: "Done",
    next: "Next",
    optional: "Optional",
    pending: "Later",
  }[status];

  const className = {
    complete: "bg-primary text-primary-foreground",
    next: "bg-foreground text-background",
    optional: "bg-muted text-muted-foreground",
    pending: "bg-muted text-muted-foreground",
  }[status];

  return (
    <span
      className={`mt-0.5 inline-flex h-7 min-w-16 items-center justify-center rounded-xl px-3 font-medium text-xs ${className}`}
    >
      {label}
    </span>
  );
}
