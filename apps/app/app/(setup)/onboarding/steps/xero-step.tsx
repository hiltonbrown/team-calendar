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
import { useState, useTransition } from "react";
import {
  advanceStepAction,
  skipXeroAction,
  startXeroFromOnboardingAction,
} from "../_actions";
import { ActionError, StepHeading } from "./step-heading";

const XERO_ERROR_COPY: Record<string, string> = {
  changed:
    "The Xero connection changed while you were signing in. Try connecting again.",
  expired:
    "The Xero sign-in took too long or was interrupted. Try connecting again.",
  failed:
    "Xero could not be connected. Try again, or set up without Xero for now.",
  organisation:
    "That Xero file could not be connected. Choose an Australian payroll organisation and try again.",
  unavailable: "Xero could not be reached. Try again in a few minutes.",
};

export function xeroReturnMessage(input: {
  cancelled: boolean;
  errorCode: string | null;
}): string | null {
  if (input.errorCode) {
    return XERO_ERROR_COPY[input.errorCode] ?? XERO_ERROR_COPY.failed ?? null;
  }
  return input.cancelled
    ? "You cancelled the Xero connection. Connect again, or set up without Xero."
    : null;
}

export function XeroStep({
  connected,
  organisationId,
  returnMessage,
}: {
  connected: boolean;
  organisationId: string;
  returnMessage: string | null;
}) {
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
      }
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
