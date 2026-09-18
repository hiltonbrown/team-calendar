"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function CalendarRetryButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      aria-busy={isPending}
      disabled={isPending}
      onClick={() => startTransition(() => router.refresh())}
      type="button"
      variant="secondary"
    >
      {isPending ? "Retrying…" : "Try again"}
    </Button>
  );
}
