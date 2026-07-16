"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { Label } from "@repo/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { toast } from "@repo/design-system/components/ui/sonner";
import type {
  PendingXeroSessionOrganisation,
  PendingXeroSessionTenant,
} from "@repo/xero";
import { useState, useTransition } from "react";
import { completeTenantSelectionAction } from "./_actions";

interface XeroConnectClientProps {
  organisations: PendingXeroSessionOrganisation[];
  presetOrganisationId: null | string;
  sessionId: string;
  tenants: PendingXeroSessionTenant[];
}

export function XeroConnectClient({
  organisations,
  presetOrganisationId,
  sessionId,
  tenants,
}: XeroConnectClientProps) {
  const [isPending, startTransition] = useTransition();
  const [selectedTenantId, setSelectedTenantId] = useState<string>(
    tenants[0]?.tenantId ?? ""
  );
  const [selectedOrganisationId, setSelectedOrganisationId] = useState<
    string | undefined
  >(presetOrganisationId ?? organisations[0]?.id);

  const selectedTenant =
    tenants.find((tenant) => tenant.tenantId === selectedTenantId) ?? null;

  const requiresOrganisationSelection =
    organisations.length > 0 && !presetOrganisationId;

  const handleComplete = () => {
    startTransition(async () => {
      const result = await completeTenantSelectionAction({
        organisationId:
          presetOrganisationId ??
          (requiresOrganisationSelection ? selectedOrganisationId : undefined),
        sessionId,
        tenantId: selectedTenantId,
      });

      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }

      window.location.href = result.value.redirectTo;
    });
  };

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Select a Xero tenant</CardTitle>
          <CardDescription>
            Choose the payroll file to connect. Team Calendar will detect its
            payroll region after selection.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {tenants.map((tenant) => (
            <button
              className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                tenant.tenantId === selectedTenantId
                  ? "border-primary bg-primary/5"
                  : "border-border bg-background"
              }`}
              key={tenant.tenantId}
              onClick={() => setSelectedTenantId(tenant.tenantId)}
              type="button"
            >
              <p className="font-medium">{tenant.tenantName}</p>
              <p className="text-muted-foreground text-sm">{tenant.tenantId}</p>
            </button>
          ))}
        </CardContent>
      </Card>

      {organisations.length > 0 ? (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Attach to an existing payroll organisation</CardTitle>
            <CardDescription>
              Xero connections are stored per payroll organisation. Select the
              organisation to attach before finalising the connection.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Label htmlFor="organisation">Organisation</Label>
            <Select
              disabled={Boolean(presetOrganisationId)}
              onValueChange={setSelectedOrganisationId}
              value={presetOrganisationId ?? selectedOrganisationId}
            >
              <SelectTrigger
                className="h-12 w-full rounded-xl bg-background"
                id="organisation"
              >
                <SelectValue placeholder="Select an organisation" />
              </SelectTrigger>
              <SelectContent>
                {organisations.map((organisation) => (
                  <SelectItem key={organisation.id} value={organisation.id}>
                    {organisation.name} ({organisation.countryCode})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Create the first payroll organisation</CardTitle>
            <CardDescription>
              Team Calendar will create the first Organisation row using the
              selected tenant name as the default label.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              Selected tenant:{" "}
              <span className="font-medium">
                {selectedTenant?.tenantName ?? "None selected"}
              </span>
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button
          disabled={
            isPending ||
            !selectedTenantId ||
            (requiresOrganisationSelection && !selectedOrganisationId)
          }
          onClick={handleComplete}
        >
          Complete connection
        </Button>
      </div>
    </div>
  );
}
