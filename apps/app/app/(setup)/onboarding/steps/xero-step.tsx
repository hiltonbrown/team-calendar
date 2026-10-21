"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@repo/design-system/components/ui/alert-dialog";
import { Button } from "@repo/design-system/components/ui/button";
import { CheckIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  advanceStepAction,
  skipXeroAction,
  startXeroFromOnboardingAction,
} from "../_actions";
import { ActionError, StepHeading } from "./step-heading";

export function XeroStep({
  connected,
  doneHref,
  organisationId,
  returnMessage,
}: {
  connected: boolean;
  doneHref: string;
  organisationId: string;
  returnMessage: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(returnMessage);
  const [isPending, startTransition] = useTransition();

  const connect = () => {
    setError(null);
    startTransition(async () => {
      const result = await startXeroFromOnboardingAction({ organisationId });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      window.location.assign(result.value.redirectUrl);
    });
  };

  const run = (
    action: () => Promise<{ ok: boolean; error?: { message: string } }>
  ) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error?.message ?? "Something went wrong. Try again.");
        return;
      }
      router.replace(doneHref);
    });
  };

  if (connected) {
    return (
      <div className="space-y-6">
        <StepHeading stepId="xero-connected">
          Xero Payroll is connected
        </StepHeading>
        <p className="flex items-start gap-2 text-body-md text-muted-foreground">
          <CheckIcon aria-hidden="true" className="mt-1 size-4 text-primary" />
          Your people, leave and balances are importing in the background.
        </p>
        <ActionError message={error} />
        <Button
          aria-busy={isPending}
          className="w-full"
          disabled={isPending}
          onClick={() =>
            run(() => advanceStepAction({ from: "xero", organisationId }))
          }
          type="button"
        >
          Continue
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <StepHeading
        description="Team Calendar reads your people, leave and leave balances from Xero, and writes approved leave back. Xero stays your payroll source of truth."
        stepId="xero"
      >
        Connect Xero Payroll
      </StepHeading>
      <ActionError message={error} />
      <div className="space-y-3">
        <Button
          aria-busy={isPending}
          className="w-full"
          disabled={isPending}
          onClick={connect}
          type="button"
        >
          Connect Xero Payroll
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              className="w-full"
              disabled={isPending}
              type="button"
              variant="ghost"
            >
              Set up without Xero
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Set up without Xero?</AlertDialogTitle>
              <AlertDialogDescription>
                You will add people and leave by hand. You can connect Xero
                Payroll later from Settings.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Go back</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => run(() => skipXeroAction({ organisationId }))}
              >
                Set up without Xero
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
