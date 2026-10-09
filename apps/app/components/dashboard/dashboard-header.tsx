import { Button } from "@repo/design-system/components/ui/button";
import Link from "next/link";
import { withOrg } from "@/lib/navigation/org-url";

export interface DashboardHeaderAction {
  href: string;
  label: string;
}

interface DashboardHeaderProps {
  /** "Friday 9 October 2026", in the person's timezone. */
  dateLabel: string;
  locationLabel: string | null;
  orgQueryValue: string | null;
  primaryAction?: DashboardHeaderAction;
  scopeLine: string;
  secondaryAction?: DashboardHeaderAction;
}

export function DashboardHeader({
  dateLabel,
  locationLabel,
  orgQueryValue,
  primaryAction,
  scopeLine,
  secondaryAction,
}: DashboardHeaderProps) {
  return (
    <section className="-mx-4 flex flex-wrap items-end justify-between gap-4 bg-surface-container-low px-4 py-6 sm:-mx-6 sm:px-6">
      <div className="min-w-0 space-y-1.5">
        <p className="font-medium text-label-lg text-on-surface-variant">
          {[dateLabel, locationLabel].filter(Boolean).join(" · ")}
        </p>
        <h1 className="text-balance font-semibold text-headline-md text-on-surface leading-tight tracking-tight">
          Dashboard
        </h1>
        <p className="text-body-md text-on-surface-variant">{scopeLine}</p>
      </div>
      {primaryAction !== undefined || secondaryAction !== undefined ? (
        <div className="flex flex-wrap gap-2">
          {secondaryAction ? (
            <Button asChild variant="outline">
              <Link href={withOrg(secondaryAction.href, orgQueryValue)}>
                {secondaryAction.label}
              </Link>
            </Button>
          ) : null}
          {primaryAction ? (
            <Button asChild>
              <Link href={withOrg(primaryAction.href, orgQueryValue)}>
                {primaryAction.label}
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
