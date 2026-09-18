"use client";

import type { BillingSummary } from "@repo/availability";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { isEarlyAccess } from "@repo/next-config/launch-mode";
import { SettingsSectionHeader } from "../components/settings-section-header";
import { startCheckout, startPortal } from "./actions";

interface BillingClientProps {
  summary: BillingSummary & { billingSyncUnhealthy: boolean };
}

const statusClassName = (status: string) => {
  if (["active", "trialing"].includes(status)) {
    return "bg-primary text-primary-foreground";
  }
  if (["canceled", "unpaid"].includes(status)) {
    return "bg-destructive/10 text-destructive";
  }
  if (
    ["past_due", "paused", "incomplete", "incomplete_expired"].includes(status)
  ) {
    return "bg-warning-container text-on-warning-container";
  }
  return "bg-muted text-muted-foreground";
};

const usageBarColour = (percentage: number) => {
  if (percentage >= 100) {
    return "bg-destructive";
  }
  if (percentage >= 80) {
    return "bg-warning";
  }
  return "bg-primary";
};

export const BillingClient = ({ summary }: BillingClientProps) => {
  const earlyAccess = isEarlyAccess();

  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        description="Review your organisation billing status and usage limits."
        title="Billing"
      />
      {summary.isOverLimit ? (
        <div className="rounded-2xl bg-destructive/10 p-4 text-destructive text-sm">
          This account is over one or more plan limits.
        </div>
      ) : null}
      {!earlyAccess && summary.billingSyncUnhealthy ? (
        <div className="rounded-2xl bg-warning-container p-4 text-on-warning-container text-sm">
          Billing changes are still being reconciled. Basic plan access applies
          until the latest Stripe event is repaired.
        </div>
      ) : null}
      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle>Current plan</CardTitle>
          <CardDescription>
            {earlyAccess
              ? "Your account is active on closed AU Early Access."
              : "Stripe owns subscription state. Team Calendar mirrors it for access control."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-2xl">{summary.plan.label}</p>
            <p className="text-muted-foreground text-sm">
              Billing period ends{" "}
              {summary.plan.currentPeriodEnd
                ? summary.plan.currentPeriodEnd.toLocaleDateString("en-AU")
                : "not set"}
            </p>
          </div>
          <Badge className={statusClassName(summary.plan.status)}>
            {summary.plan.status}
          </Badge>
        </CardContent>
      </Card>
      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle>Usage</CardTitle>
          <CardDescription>Current usage against plan limits.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {summary.usage.map((item) => {
            const unlimited = item.limit === null;
            const percentage =
              item.limit === null
                ? 0
                : Math.min((item.currentValue / item.limit) * 100, 100);
            const barColour = usageBarColour(percentage);
            return (
              <div key={item.metricKey}>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span>{item.label}</span>
                  <span>
                    {item.currentValue} / {unlimited ? "Unlimited" : item.limit}{" "}
                    {item.unit}
                  </span>
                </div>
                {!unlimited && (
                  <div className="h-2 rounded-full bg-muted">
                    <div
                      className={`h-2 rounded-full ${barColour}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
      {earlyAccess ? (
        <Card className="rounded-xl border-warning/20 bg-warning-container/50">
          <CardHeader>
            <CardTitle>Closed Early Access</CardTitle>
            <CardDescription>
              Paid self-service billing, plan upgrades, and customer portal
              actions are disabled during closed early access.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-muted-foreground text-sm">
            <p>
              Your organisation is participating in closed early access for
              Australian Xero Payroll teams. Pricing and commercial terms will
              be confirmed prior to any future paid billing activation.
            </p>
            <p>
              For support or questions regarding your rollout, contact{" "}
              <a
                className="font-medium text-primary underline"
                href="mailto:support@teamcalendar.online"
              >
                support@teamcalendar.online
              </a>
              .
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-wrap gap-3">
          <form action={startPortal}>
            <Button variant="outline">Manage billing</Button>
          </form>
          <form action={startCheckout.bind(null, "premium")}>
            <Button>Upgrade to Premium</Button>
          </form>
        </div>
      )}
    </div>
  );
};
