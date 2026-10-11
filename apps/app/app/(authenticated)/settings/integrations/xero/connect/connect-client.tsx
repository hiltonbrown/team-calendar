"use client";
import {
  Alert,
  AlertDescription,
} from "@repo/design-system/components/ui/alert";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { Checkbox } from "@repo/design-system/components/ui/checkbox";
import { Label } from "@repo/design-system/components/ui/label";
import { toast } from "@repo/design-system/components/ui/sonner";
import type {
  PendingXeroSessionOrganisation,
  PendingXeroSessionTenant,
} from "@repo/xero";
import { useState, useTransition } from "react";
import { completeTenantSelectionAction } from "./_actions";

interface XeroConnectClientProps {
  organisations: PendingXeroSessionOrganisation[];
  payrollEntityAllowance?: {
    used: number;
    limit: number | null;
    remaining: number | null;
  };
  presetOrganisationId: null | string;
  sessionId: string;
  tenants: PendingXeroSessionTenant[];
}
const UNAVAILABLE_COPY =
  "This Xero organisation is connected to another Team Calendar account. Ask its administrator to remove it there first.";
export function XeroConnectClient({
  presetOrganisationId,
  sessionId,
  tenants,
  payrollEntityAllowance,
}: XeroConnectClientProps) {
  const [isPending, startTransition] = useTransition();
  const [selectedTenantIds, setSelectedTenantIds] = useState<string[]>(() => {
    const first = tenants.find((tenant) => tenant.state !== "unavailable");
    return first ? [first.tenantId] : [];
  });
  const [outcomes, setOutcomes] = useState<
    Array<{ tenantId: string; ok: boolean; message?: string }>
  >([]);
  const [redirectTo, setRedirectTo] = useState<string | null>(null);
  const newFileCount = presetOrganisationId
    ? 0
    : tenants.filter(
        (tenant) =>
          selectedTenantIds.includes(tenant.tenantId) &&
          tenant.state !== "already_in_account"
      ).length;
  const exceedsAllowance =
    typeof payrollEntityAllowance?.remaining === "number" &&
    newFileCount > payrollEntityAllowance.remaining;
  const handleComplete = () =>
    startTransition(async () => {
      const result = await completeTenantSelectionAction({
        organisationId: presetOrganisationId ?? undefined,
        sessionId,
        tenantIds: selectedTenantIds,
        // New companies start in the connecting user's time zone; owners can change it in Settings.
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      setOutcomes(result.value.outcomes);
      setRedirectTo(result.value.redirectTo);
      if (result.value.outcomes.every((outcome) => outcome.ok)) {
        window.location.href = result.value.redirectTo;
      }
    });
  return (
    <div className="space-y-6">
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>
            {presetOrganisationId
              ? "Select a Xero organisation"
              : "Select Xero organisations"}
          </CardTitle>
          <CardDescription>
            {presetOrganisationId
              ? "Choose one Xero payroll file for this company."
              : "Each selected payroll file becomes a company in this account. Files already in this account are reconnected."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {payrollEntityAllowance ? (
            <p className="text-body-sm text-muted-foreground">
              {payrollEntityAllowance.used} of{" "}
              {payrollEntityAllowance.limit ?? "unlimited"} Xero files used
            </p>
          ) : null}
          {tenants.map((tenant) => {
            const unavailable = tenant.state === "unavailable";
            const id = `xero-tenant-${tenant.tenantId}`;
            return (
              <div
                className="rounded-xl border border-border p-4"
                key={tenant.tenantId}
              >
                <div className="flex items-center gap-3">
                  <Checkbox
                    aria-describedby={unavailable ? `${id}-help` : undefined}
                    checked={selectedTenantIds.includes(tenant.tenantId)}
                    disabled={isPending || unavailable}
                    id={id}
                    onCheckedChange={(checked) =>
                      setSelectedTenantIds((current) => {
                        if (checked !== true) {
                          return current.filter(
                            (value) => value !== tenant.tenantId
                          );
                        }
                        if (presetOrganisationId) {
                          return [tenant.tenantId];
                        }
                        return [...current, tenant.tenantId];
                      })
                    }
                  />
                  <Label className="flex-1 font-medium" htmlFor={id}>
                    {tenant.tenantName}
                  </Label>
                  <Badge variant="secondary">
                    {tenantStateLabel(tenant.state)}
                  </Badge>
                </div>
                {tenant.isCurrentConsent ? (
                  <p className="mt-2 text-body-sm text-muted-foreground">
                    Authorised just now
                  </p>
                ) : null}
                {unavailable ? (
                  <p
                    className="mt-2 text-body-sm text-muted-foreground"
                    id={`${id}-help`}
                  >
                    {UNAVAILABLE_COPY}
                  </p>
                ) : null}
              </div>
            );
          })}
          {exceedsAllowance ? (
            <Alert role="alert">
              <AlertDescription>
                Your selections exceed the remaining Xero file allowance. Select
                fewer new files or upgrade your plan.
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>
      {outcomes.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Connection results</CardTitle>
          </CardHeader>
          <CardContent>
            <ul aria-live="polite" className="space-y-3">
              {outcomes.map((outcome) => (
                <li key={outcome.tenantId}>
                  <p className="font-medium">
                    {tenants.find(
                      (tenant) => tenant.tenantId === outcome.tenantId
                    )?.tenantName ?? "Xero organisation"}
                  </p>
                  <p className="text-body-sm">
                    {outcome.ok ? "Connected" : outcome.message}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
      <div className="flex justify-end gap-3">
        {redirectTo ? (
          <Button asChild variant="outline">
            <a href={redirectTo}>Back to Xero settings</a>
          </Button>
        ) : null}
        <Button
          disabled={
            isPending || selectedTenantIds.length === 0 || exceedsAllowance
          }
          onClick={handleComplete}
        >
          Complete connection
        </Button>
      </div>
    </div>
  );
}

function tenantStateLabel(state: PendingXeroSessionTenant["state"]): string {
  if (state === "unavailable") {
    return "Unavailable";
  }
  if (state === "already_in_account") {
    return "Already in this account";
  }
  return "Available";
}
