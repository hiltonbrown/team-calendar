"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { completeWelcomeAction } from "../_actions";

// "Done" and "Skip" both mark the welcome as seen, then open the dashboard.
export function useCompleteWelcome(organisationId: string, homeHref: string) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const complete = (skipped: boolean) => {
    setError(null);
    startTransition(async () => {
      const result = await completeWelcomeAction({ organisationId, skipped });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.push(homeHref);
    });
  };
  return { complete, error, isPending };
}

export function SkipToDashboard({
  homeHref,
  organisationId,
}: {
  homeHref: string;
  organisationId: string;
}) {
  const { complete, error, isPending } = useCompleteWelcome(
    organisationId,
    homeHref
  );
  return (
    <div className="space-y-2">
      <Button
        className="w-full"
        disabled={isPending}
        onClick={() => complete(true)}
        type="button"
        variant="ghost"
      >
        Skip to dashboard
      </Button>
      {error ? (
        <p className="text-center text-body-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
