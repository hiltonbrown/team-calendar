"use client";

import type { BillingSummary } from "@repo/availability";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/design-system/components/ui/card";
import { startCheckout, startPortal } from "./actions";
import { SettingsSectionHeader } from "../components/settings-section-header";

interface BillingClientProps { summary: BillingSummary }

const statusClassName = (status: string) => {
  if (["active", "trialing"].includes(status)) return "bg-primary text-primary-foreground";
  if (["canceled", "unpaid"].includes(status)) return "bg-destructive/10 text-destructive";
  if (["past_due", "paused", "incomplete", "incomplete_expired"].includes(status)) return "bg-amber-500/15 text-amber-700";
  return "bg-muted text-muted-foreground";
};

export const BillingClient = ({ summary }: BillingClientProps) => (
  <div className="space-y-6">
    <SettingsSectionHeader description="Review your organisation billing mirror from Stripe." title="Billing" />
    {summary.isOverLimit && <div className="rounded-2xl bg-destructive/10 p-4 text-destructive text-sm">This account is over one or more plan limits.</div>}
    <Card className="rounded-2xl"><CardHeader><CardTitle>Current plan</CardTitle><CardDescription>Stripe owns subscription state. Team Calendar mirrors it for access control.</CardDescription></CardHeader><CardContent className="flex items-center justify-between gap-4"><div><p className="font-semibold text-2xl">{summary.plan.label}</p><p className="text-muted-foreground text-sm">Billing period ends {summary.plan.currentPeriodEnd ? summary.plan.currentPeriodEnd.toLocaleDateString("en-AU") : "not set"}</p></div><Badge className={statusClassName(summary.plan.status)}>{summary.plan.status}</Badge></CardContent></Card>
    <Card className="rounded-2xl"><CardHeader><CardTitle>Usage</CardTitle><CardDescription>Current usage against plan limits.</CardDescription></CardHeader><CardContent className="space-y-4">{summary.usage.map((item) => { const unlimited = item.limit === null; const percentage = unlimited ? 0 : Math.min((item.currentValue / item.limit) * 100, 100); const barColour = percentage >= 100 ? "bg-destructive" : percentage >= 80 ? "bg-amber-500" : "bg-primary"; return <div key={item.metricKey}><div className="mb-2 flex items-center justify-between text-sm"><span>{item.label}</span><span>{item.currentValue} / {unlimited ? "Unlimited" : item.limit} {item.unit}</span></div>{!unlimited && <div className="h-2 rounded-full bg-muted"><div className={`h-2 rounded-full ${barColour}`} style={{ width: `${percentage}%` }} /></div>}</div>; })}</CardContent></Card>
    <div className="flex flex-wrap gap-3"><form action={startPortal}><Button variant="outline">Manage billing</Button></form><form action={startCheckout.bind(null, "premium")}><Button>Upgrade to Premium</Button></form></div>
  </div>
);
