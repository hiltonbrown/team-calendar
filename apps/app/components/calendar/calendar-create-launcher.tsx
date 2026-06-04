"use client";

import { cn } from "@repo/design-system/lib/utils";
import { useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { withOrg } from "@/lib/navigation/org-url";

interface CalendarCreateLauncherProps {
  children: ReactNode;
  className?: string;
  personId: string | null;
  startsAt: string;
}

export function CalendarCreateLauncher({
  children,
  className,
  personId,
  startsAt,
}: CalendarCreateLauncherProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const org = searchParams.get("org");

  const navigate = () => {
    const params = new URLSearchParams({ startsAt });
    if (personId) {
      params.set("personId", personId);
    }
    router.push(withOrg(`/plans/new?${params.toString()}`, org));
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: calendar cells contain event buttons, so the create target cannot be a nested button.
    <div
      className={cn("text-left", className)}
      onClick={navigate}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          navigate();
        }
      }}
      role="button"
      tabIndex={0}
    >
      {children}
    </div>
  );
}
