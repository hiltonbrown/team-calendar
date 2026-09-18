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
}

export function OnboardingChecklist({
  state,
  orgQueryValue,
}: OnboardingChecklistProps) {
  const nextStep = state.steps.find((step) => step.status === "next");
  const completedSteps = state.steps.filter(
    (step) => step.status === "complete"
  );
  const deferredSteps = state.steps.filter(
    (step) => step.status === "optional" || step.status === "pending"
  );
  const progressLabel = state.isComplete
    ? `Setup complete. ${state.requiredCount} of ${state.requiredCount} required steps complete.`
    : `${state.completedRequiredCount} of ${state.requiredCount} required steps complete.`;

  return (
    <section
      aria-labelledby="setup-checklist-title"
      className="rounded-2xl bg-muted p-5 sm:p-6"
    >
      <div className="max-w-2xl">
        <h2
          className="font-semibold text-2xl tracking-tight"
          id="setup-checklist-title"
        >
          {state.isComplete ? "Setup complete" : "Finish the essentials"}
        </h2>
        <p className="mt-2 text-muted-foreground text-sm">
          Team Calendar works without Xero or completed onboarding. Complete the
          useful steps now, or return whenever you are ready.
        </p>
        <div className="mt-5 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-medium">Required setup progress</span>
            <span className="text-muted-foreground">{progressLabel}</span>
          </div>
          <progress
            aria-label="Required setup progress"
            className="h-2 w-full overflow-hidden rounded-full accent-primary"
            max={state.requiredCount}
            value={state.completedRequiredCount}
          />
        </div>
      </div>

      {nextStep ? (
        <div className="mt-6 grid gap-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="flex min-w-0 gap-3">
            <StatusBadge status={nextStep.status} />
            <div className="min-w-0">
              <h3 className="font-semibold text-base">{nextStep.title}</h3>
              <p className="mt-1 text-muted-foreground text-sm">
                {nextStep.description}
              </p>
            </div>
          </div>
          <Button asChild>
            <Link href={withOrg(nextStep.ctaHref, orgQueryValue)}>
              {nextStep.ctaLabel}
            </Link>
          </Button>
        </div>
      ) : (
        <div className="mt-6">
          <Button asChild>
            <Link href={withOrg("/", orgQueryValue)}>Return to dashboard</Link>
          </Button>
        </div>
      )}

      {completedSteps.length > 0 ? (
        <StepGroup
          label={`Completed (${completedSteps.length})`}
          orgQueryValue={orgQueryValue}
          steps={completedSteps}
        />
      ) : null}

      {deferredSteps.length > 0 ? (
        <StepGroup
          label={`Optional and later (${deferredSteps.length})`}
          orgQueryValue={orgQueryValue}
          steps={deferredSteps}
        />
      ) : null}
    </section>
  );
}

function StepGroup({
  label,
  orgQueryValue,
  steps,
}: {
  label: string;
  orgQueryValue: string | null;
  steps: OnboardingState["steps"];
}) {
  return (
    <details className="mt-4">
      <summary className="flex min-h-11 cursor-pointer items-center font-medium text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {label}
      </summary>
      <ul className="space-y-1 pb-2">
        {steps.map((step) => (
          <li
            className="grid gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            key={step.id}
          >
            <div className="flex min-w-0 gap-3">
              <StatusBadge status={step.status} />
              <div className="min-w-0">
                <h3 className="font-medium text-sm">{step.title}</h3>
                <p className="mt-1 text-muted-foreground text-sm">
                  {step.description}
                </p>
              </div>
            </div>
            <Button asChild size="sm" variant="ghost">
              <Link href={withOrg(step.ctaHref, orgQueryValue)}>
                {step.ctaLabel}
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </details>
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
    complete: "bg-surface-container-high text-muted-foreground",
    next: "bg-primary text-primary-foreground",
    optional: "bg-background text-muted-foreground",
    pending: "bg-background text-muted-foreground",
  }[status];

  return (
    <span
      className={`mt-0.5 inline-flex h-7 min-w-16 items-center justify-center rounded-xl px-3 font-medium text-xs ${className}`}
    >
      {label}
    </span>
  );
}
