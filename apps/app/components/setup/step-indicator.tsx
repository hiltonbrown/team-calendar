import { CheckIcon } from "lucide-react";

export interface SetupStep {
  id: string;
  label: string;
}

export function StepIndicator({
  completedIds,
  currentId,
  steps,
}: {
  completedIds: readonly string[];
  currentId: string;
  steps: readonly SetupStep[];
}) {
  const currentIndex = steps.findIndex((step) => step.id === currentId);
  return (
    <nav aria-label="Setup progress" className="space-y-3">
      <p className="font-medium text-label-lg text-muted-foreground">
        Step {currentIndex + 1} of {steps.length}
      </p>
      <ol className="flex gap-1.5">
        {steps.map((step, index) => {
          const isCurrent = step.id === currentId;
          const isComplete = completedIds.includes(step.id);
          return (
            <li
              aria-current={isCurrent ? "step" : undefined}
              className="flex min-w-0 flex-1 flex-col gap-1.5"
              key={step.id}
            >
              <span
                aria-hidden="true"
                className={[
                  "h-1.5 rounded-full",
                  isCurrent || isComplete
                    ? "bg-primary"
                    : "bg-surface-container-highest",
                ].join(" ")}
              />
              <span
                className={[
                  "hidden items-center gap-1 truncate text-label-md sm:flex",
                  isCurrent
                    ? "font-medium text-foreground"
                    : "text-muted-foreground",
                ].join(" ")}
              >
                {isComplete ? (
                  <CheckIcon aria-hidden="true" className="size-3.5 shrink-0" />
                ) : null}
                <span className="truncate">{step.label}</span>
                {isComplete ? (
                  <span className="sr-only">(completed)</span>
                ) : null}
              </span>
              <span className="sr-only sm:hidden">
                {`${index + 1}. ${step.label}${isComplete ? " (completed)" : ""}`}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
