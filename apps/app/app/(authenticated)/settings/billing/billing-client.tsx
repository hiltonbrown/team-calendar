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
import { SettingsSectionHeader } from "../components/settings-section-header";

interface BillingClientProps {
  locked?: boolean;
  summary: BillingSummary;
}

export const BillingClient = ({
  locked = false,
  summary,
}: BillingClientProps) => (
  <div className="space-y-6">
    <SettingsSectionHeader
      description="Billing is read-only here. Plan changes are handled outside LeaveSync."
      title="Billing"
    />

    {summary.isOverLimit && (
      <div className="rounded-2xl bg-destructive/10 p-4 text-destructive text-sm">
        This organisation is over one or more plan limits.
      </div>
    )}

    {locked && (
      <div className="rounded-2xl bg-muted p-4 text-muted-foreground text-sm">
        Billing actions are managed by the organisation owner.
      </div>
    )}

    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Current plan</CardTitle>
        <CardDescription>
          Seats purchased: {summary.plan.seatsPurchased}
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
        <Badge variant="outline">{summary.plan.status}</Badge>
      </CardContent>
    </Card>

    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Usage</CardTitle>
        <CardDescription>Current usage against plan limits.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {summary.usage.map((item) => {
          const percentage =
            item.limit === null
              ? 0
              : Math.min((item.currentValue / item.limit) * 100, 100);
          return (
            <div key={item.metricKey}>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span>{item.label}</span>
                <span>
                  {item.currentValue} / {item.limit ?? "Unlimited"} {item.unit}
                </span>
              </div>
              {item.limit !== null && (
                <div className="h-2 rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-primary"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>

    {!summary.hasUpgradeFlow && (
      <p className="text-muted-foreground text-sm">
        To change your plan, contact support.
      </p>
    )}
    {summary.hasUpgradeFlow && <Button disabled={locked}>Upgrade plan</Button>}
    {summary.hasContactFlow && (
      <Button disabled={locked} variant="outline">
        Contact support
      </Button>
    )}
  </div>
);
