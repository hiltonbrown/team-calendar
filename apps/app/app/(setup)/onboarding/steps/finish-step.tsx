"use client";

import type { StageStatus, WizardMode } from "@repo/availability";
import { Button } from "@repo/design-system/components/ui/button";
import { CheckIcon, CircleAlertIcon, LoaderIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { finishAction } from "../_actions";
import { ImportPoller } from "./import-poller";
import { ActionError, StepHeading } from "./step-heading";

interface Stages {
  balances: StageStatus;
  leave: StageStatus;
  people: StageStatus;
}

const STAGE_LABELS: Record<keyof Stages, string> = {
  balances: "Leave balances",
  leave: "Leave",
  people: "People",
};

const STATUS_LABELS: Record<StageStatus, string> = {
  complete: "Imported",
  failed: "Did not finish",
  not_started: "Waiting",
  running: "Importing",
};

const STAGE_ORDER: (keyof Stages)[] = ["people", "leave", "balances"];

function isRunning(status: StageStatus): boolean {
  return status === "running" || status === "not_started";
}

export function FinishStep({
  calendarHref,
  mode,
  organisationId,
  stages,
}: {
  calendarHref: string;
  mode: WizardMode;
  organisationId: string;
  stages: Stages;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const manual = mode === "manual";
  const leaveReady =
    manual || stages.leave === "complete" || stages.leave === "failed";
  const anyRunning =
    !manual && Object.values(stages).some((status) => isRunning(status));

  const finish = (force: boolean) => {
    setError(null);
    startTransition(async () => {
      const result = await finishAction({ force, organisationId });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.push(calendarHref);
    });
  };

  const summary = manual
    ? "Ready."
    : STAGE_ORDER.map(
        (key) => `${STAGE_LABELS[key]}: ${STATUS_LABELS[stages[key]]}`
      ).join(". ");

  return (
    <div className="space-y-6">
      <ImportPoller active={anyRunning} />
      <StepHeading
        description={finishDescription(manual, leaveReady, stages.leave)}
        stepId="finish"
      >
        {leaveReady ? "Your calendar is ready" : "Almost there"}
      </StepHeading>

      {manual ? null : (
        <ul className="space-y-2">
          {STAGE_ORDER.map((key) => (
            <li
              className="flex items-center justify-between gap-3 rounded-lg bg-surface-container-low px-4 py-3 text-body-sm"
              key={key}
            >
              <span className="font-medium">{STAGE_LABELS[key]}</span>
              <StageBadge status={stages[key]} />
            </li>
          ))}
        </ul>
      )}
      <p aria-live="polite" className="sr-only">
        {summary}
      </p>

      <ActionError message={error} />
      <div className="space-y-2">
        <Button
          aria-busy={isPending}
          className="w-full"
          disabled={isPending || !leaveReady}
          onClick={() => finish(false)}
          type="button"
        >
          Open team calendar
        </Button>
        {leaveReady ? null : (
          <>
            <p className="text-center text-label-md text-muted-foreground">
              Your calendar opens when leave has been imported.
            </p>
            <Button
              className="w-full"
              disabled={isPending}
              onClick={() => finish(true)}
              type="button"
              variant="ghost"
            >
              Open calendar now
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function finishDescription(
  manual: boolean,
  leaveReady: boolean,
  leave: StageStatus
): string {
  if (manual) {
    return "Public holidays are on your calendar. Add leave and availability from the calendar whenever you are ready.";
  }
  if (leave === "failed") {
    return "The leave import from Xero did not finish. Your calendar explains what happened and retries automatically.";
  }
  return leaveReady
    ? "Leave and public holidays from Xero Payroll are on your team calendar."
    : "Team Calendar is importing leave from Xero Payroll. This can take a few minutes for larger payroll files.";
}

function StageBadge({ status }: { status: StageStatus }) {
  let icon = (
    <LoaderIcon
      aria-hidden="true"
      className="size-3.5 animate-spin motion-reduce:animate-none"
    />
  );
  if (status === "complete") {
    icon = <CheckIcon aria-hidden="true" className="size-3.5 text-primary" />;
  } else if (status === "failed") {
    icon = (
      <CircleAlertIcon aria-hidden="true" className="size-3.5 text-error" />
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      {icon}
      {STATUS_LABELS[status]}
    </span>
  );
}
