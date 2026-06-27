"use client";

import { Badge } from "@repo/design-system/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { cn } from "@repo/design-system/lib/utils";

export interface BillingUsageItem {
  current: number;
  label: string;
  // -1 means unlimited and renders as "Unlimited" with no bar.
  limit: number;
  unit: string;
}

export interface BillingView {
  billingInterval: "month" | "year" | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  planName: string;
  status: string;
  usage: BillingUsageItem[];
}

interface BillingClientProps {
  view: BillingView;
}

const UNLIMITED = -1;
const WARN_THRESHOLD = 80;

interface StatusBadge {
  className: string;
  label: string;
}

// Active reads as primary, a cancelled or ended subscription as a muted error,
// and a past-due subscription as amber. Unknown Clerk statuses fall back to a
// neutral outline so the surface never breaks on a new status string.
function statusBadge(status: string): StatusBadge {
  const normalised = status.toLowerCase();
  if (normalised === "active") {
    return { className: "bg-primary text-primary-foreground", label: "Active" };
  }
  if (normalised === "past_due") {
    return {
      className: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
      label: "Past due",
    };
  }
  if (normalised === "canceled" || normalised === "ended") {
    return {
      className: "bg-destructive/10 text-destructive",
      label: "Cancelled",
    };
  }
  return { className: "bg-muted text-muted-foreground", label: status };
}

// A zero-limit plan reads as 0% when nothing is used and 100% the moment
// anything is, rather than a division-by-zero guard always showing a full bar.
function usagePercentage(current: number, limit: number): number {
  if (limit === 0) {
    return current > 0 ? 100 : 0;
  }
  return Math.min((current / limit) * 100, 100);
}

function barColour(percentage: number): string {
  if (percentage >= 100) {
    return "bg-destructive";
  }
  if (percentage >= WARN_THRESHOLD) {
    return "bg-amber-500";
  }
  return "bg-primary";
}

export const BillingClient = ({ view }: BillingClientProps) => {
  const badge = statusBadge(view.status);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl">Billing</h1>
        <p className="text-muted-foreground text-sm">
          Billing is read-only here. Plan changes are handled through Clerk.
        </p>
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Current plan</CardTitle>
          <CardDescription>
            {view.billingInterval
              ? `Billed ${view.billingInterval === "year" ? "annually" : "monthly"} in USD.`
              : "Billed in USD."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-2xl">{view.planName}</p>
            <p className="text-muted-foreground text-sm">
              {view.cancelAtPeriodEnd
                ? "Cancels at the end of the current period"
                : "Renews"}{" "}
              {view.currentPeriodEnd
                ? view.currentPeriodEnd.toLocaleDateString("en-AU")
                : "date not set"}
            </p>
          </div>
          <Badge
            className={cn("border-transparent", badge.className)}
            variant="outline"
          >
            {badge.label}
          </Badge>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Usage</CardTitle>
          <CardDescription>Current usage against plan limits.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {view.usage.map((item) => {
            if (item.limit === UNLIMITED) {
              return (
                <div key={item.label}>
                  <div className="flex items-center justify-between text-sm">
                    <span>{item.label}</span>
                    <span className="text-muted-foreground">
                      {item.current} / Unlimited {item.unit}
                    </span>
                  </div>
                </div>
              );
            }

            const percentage = usagePercentage(item.current, item.limit);

            return (
              <div key={item.label}>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span>{item.label}</span>
                  <span>
                    {item.current} / {item.limit} {item.unit}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-2 rounded-full transition-all",
                      barColour(percentage)
                    )}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-sm">
        To change your plan, use the billing portal from your account menu.
      </p>
    </div>
  );
};
