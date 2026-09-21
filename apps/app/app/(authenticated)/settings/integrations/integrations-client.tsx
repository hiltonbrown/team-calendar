"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import Link from "next/link";
import { ProviderStatusBadge } from "../components/provider-status-badge";
import { SettingsSectionHeader } from "../components/settings-section-header";
import type { OrganisationWithConnectionView } from "./_connection-view";

interface IntegrationsClientProps {
  organisations: OrganisationWithConnectionView[];
}

export const IntegrationsClient = ({
  organisations,
}: IntegrationsClientProps) => {
  const totals = organisations.reduce(
    (accumulator, organisation) => {
      const status = statusForConnection(organisation.xero_connection);
      accumulator.total += 1;
      if (status === "connected") {
        accumulator.connected += 1;
      } else if (status === "expired" || status === "error") {
        accumulator.stale += 1;
      } else {
        accumulator.disconnected += 1;
      }
      return accumulator;
    },
    { connected: 0, disconnected: 0, stale: 0, total: 0 }
  );

  let rolledUpStatus: "connected" | "disconnected" | "error" | "expired";
  if (totals.connected > 0 && totals.stale === 0) {
    rolledUpStatus = "connected";
  } else if (totals.stale > 0) {
    rolledUpStatus = "error";
  } else if (totals.connected > 0) {
    rolledUpStatus = "expired";
  } else {
    rolledUpStatus = "disconnected";
  }

  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        description="Xero is shared at the Clerk Organisation level and attached per payroll organisation."
        title="Integrations"
      />

      <Card className="rounded-2xl">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Xero Payroll</CardTitle>
              <CardDescription>
                One shared integration overview for every payroll organisation
                in this Clerk Organisation.
              </CardDescription>
            </div>
            <ProviderStatusBadge status={rolledUpStatus} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <Stat label="Payroll organisations" value={String(totals.total)} />
            <Stat label="Connected" value={String(totals.connected)} />
            <Stat label="Stale or error" value={String(totals.stale)} />
            <Stat label="Not connected" value={String(totals.disconnected)} />
          </div>
          <div className="space-y-2 rounded-2xl bg-muted/30 p-4 text-label-lg">
            {organisations.map((organisation) => {
              const status = statusForConnection(organisation.xero_connection);
              const tenantName =
                organisation.xero_connection?.xero_tenant?.tenant_name ??
                "Not connected";

              return (
                <div
                  className="flex flex-wrap items-center justify-between gap-3"
                  key={organisation.id}
                >
                  <div>
                    <p className="font-medium">{organisation.name}</p>
                    <p className="text-muted-foreground">
                      {tenantName}
                      {organisation.xero_connection?.xero_tenant?.payroll_region
                        ? ` · ${organisation.xero_connection.xero_tenant.payroll_region}`
                        : ""}
                    </p>
                  </div>
                  <ProviderStatusBadge status={status} />
                </div>
              );
            })}
          </div>
          <Button asChild>
            <Link href="/settings/integrations/xero">Manage Xero</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

function statusForConnection(
  connection: OrganisationWithConnectionView["xero_connection"]
): "connected" | "disconnected" | "error" | "expired" | "revoked" {
  if (!connection) {
    return "disconnected";
  }
  if (connection.revoked_at) {
    return "revoked";
  }
  if (connection.status === "stale") {
    return "expired";
  }
  if (connection.status === "disconnected" || connection.disconnected_at) {
    return "disconnected";
  }
  if (
    connection.status === "pending" ||
    connection.status === "pending_tenant_selection"
  ) {
    return "error";
  }
  if (connection.expires_at.getTime() <= Date.now()) {
    return "expired";
  }
  return "connected";
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/30 p-3">
      <p className="text-label-md text-muted-foreground">{label}</p>
      <p className="font-medium text-body-sm">{value}</p>
    </div>
  );
}
