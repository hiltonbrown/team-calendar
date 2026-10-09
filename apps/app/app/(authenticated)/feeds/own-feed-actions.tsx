"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { PlusIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { createOwnFeedAction } from "./_actions";

type OwnFeedKind = "personal" | "team";

const LABELS: Record<OwnFeedKind, string> = {
  personal: "Create my calendar feed",
  team: "Create my team feed",
};

export function OwnFeedActions({
  canCreatePersonal,
  canCreateTeam,
  organisationId,
}: {
  canCreatePersonal: boolean;
  canCreateTeam: boolean;
  organisationId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [pendingKind, setPendingKind] = useState<OwnFeedKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const kinds = (["personal", "team"] as const).filter((kind) =>
    kind === "personal" ? canCreatePersonal : canCreateTeam
  );
  if (kinds.length === 0) {
    return null;
  }

  const create = (kind: OwnFeedKind) => {
    setError(null);
    setPendingKind(kind);
    startTransition(async () => {
      const result = await createOwnFeedAction({ kind, organisationId });
      setPendingKind(null);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      // The action revalidates /feeds, so the new feed is now the
      // recommended one; move focus to it for keyboard and screen readers.
      window.requestAnimationFrame(() => {
        document.getElementById("your-calendar-heading")?.focus();
      });
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {kinds.map((kind) => (
          <Button
            aria-busy={pendingKind === kind}
            disabled={isPending}
            key={kind}
            onClick={() => create(kind)}
            type="button"
            variant="outline"
          >
            <PlusIcon aria-hidden="true" />
            {LABELS[kind]}
          </Button>
        ))}
      </div>
      {error ? (
        <p className="text-body-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
