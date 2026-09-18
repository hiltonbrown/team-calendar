"use client";

import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { toast } from "@repo/design-system/components/ui/sonner";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { dispatchManualSyncAction } from "@/app/(authenticated)/sync/_actions";
import { ConfirmActionDialog } from "../../components/confirm-action-dialog";
import { ProviderStatusBadge } from "../../components/provider-status-badge";
import { SettingsSectionHeader } from "../../components/settings-section-header";
import type { OrganisationWithConnectionView } from "../_connection-view";
import {
  connectXeroAction,
  disconnectXeroAction,
  pauseTenantSyncAction,
  refreshXeroConnectionAction,
  resumeTenantSyncAction,
} from "./_actions";

interface XeroClientProps {
  organisations: OrganisationWithConnectionView[];
}

export const XeroClient = ({ organisations }: XeroClientProps) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [disconnectTarget, setDisconnectTarget] = useState<{
    connectionId: string;
    mode: "destructive" | "soft";
    organisationId: string;
    organisationName: string;
  } | null>(null);

  const handleConnect = (organisationId: string) => {
    startTransition(async () => {
      const result = await connectXeroAction({ organisationId });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      window.location.href = result.value.redirectUrl;
    });
  };

  const handleRefresh = (connectionId: string, organisationId: string) => {
    startTransition(async () => {
      const result = await refreshXeroConnectionAction({
        connectionId,
        organisationId,
      });
      toast[result.ok ? "success" : "error"](
        result.ok ? "Connection refreshed." : result.error.message
      );
    });
  };

  const handleDisconnect = () => {
    if (!disconnectTarget) {
      return;
    }
    startTransition(async () => {
      const result = await disconnectXeroAction({
        confirmationText: disconnectTarget.organisationName,
        connectionId: disconnectTarget.connectionId,
        mode: disconnectTarget.mode,
        organisationId: disconnectTarget.organisationId,
      });
      const successMessage =
        disconnectTarget.mode === "destructive"
          ? "Xero disconnected and Xero-linked data purged."
          : "Xero disconnected. Historical data is now read-only.";
      toast[result.ok ? "success" : "error"](
        result.ok ? successMessage : result.error.message
      );

      if (result.ok) {
        setDisconnectTarget(null);
        router.refresh();
      }
    });
  };

  const updatePauseState = (
    organisationId: string,
    xeroTenantId: string,
    paused: boolean
  ) => {
    startTransition(async () => {
      const result = paused
        ? await pauseTenantSyncAction({ organisationId, xeroTenantId })
        : await resumeTenantSyncAction({ organisationId, xeroTenantId });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(
        paused ? "Automatic Xero sync paused." : "Automatic Xero sync resumed."
      );
      router.refresh();
    });
  };

  const runSync = (
    organisationId: string,
    xeroTenantId: string,
    runType: string
  ) => {
    startTransition(async () => {
      try {
        const result = await dispatchManualSyncAction({
          organisationId,
          runType,
          xeroTenantId,
        });
        if (!result.ok) {
          toast.error(result.error.message);
          return;
        }
        if (!result.value.queued) {
          toast.error(
            result.value.reason === "connection_not_active"
              ? "Reconnect Xero before running syncs."
              : "This sync is not available yet."
          );
          return;
        }
        toast.success("Sync queued.");
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to dispatch manual sync."
        );
      }
    });
  };

  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        description="Each payroll organisation has one Xero connection and tenant. Connection status is shared with every administrator in this account."
        title="Xero Payroll"
      />

      {/* biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Organisation card renders status, stats, sync actions, and disconnect confirmation */}
      {organisations.map((organisation) => {
        const connection = organisation.xero_connection;
        const tenant = connection?.xero_tenant ?? null;
        const status = statusForConnection(connection);
        const canRefresh =
          connection?.status === "active" &&
          connection.disconnected_at === null &&
          connection.revoked_at === null;
        const recommendedSync = tenant
          ? recommendedSyncForTenant(tenant)
          : null;

        return (
          <Card className="rounded-2xl" key={organisation.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle>{organisation.name}</CardTitle>
                  <CardDescription>
                    {tenant
                      ? `${tenant.tenant_name ?? tenant.xero_tenant_id} · ${tenant.payroll_region}`
                      : `${organisation.country_code} payroll organisation`}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  {tenant?.sync_paused_at ? (
                    <Badge variant="secondary">Sync paused</Badge>
                  ) : null}
                  <ProviderStatusBadge status={status} />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {connection?.last_error_message ? (
                <div className="rounded-2xl bg-destructive/10 p-3 text-destructive text-sm">
                  {connection.last_error_message}
                </div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-4">
                <Stat
                  label="People sync"
                  value={formatTimestamp(tenant?.last_people_sync_at ?? null)}
                />
                <Stat
                  label="Leave sync"
                  value={formatTimestamp(
                    tenant?.last_leave_records_sync_at ?? null
                  )}
                />
                <Stat
                  label="Latest balance page"
                  value={formatTimestamp(
                    tenant?.last_leave_balances_sync_at ?? null
                  )}
                />
                <Stat
                  label="Reconciliation"
                  value={formatTimestamp(
                    tenant?.last_approval_state_reconciled_at ?? null
                  )}
                />
              </div>

              {tenant?.leave_balances_stale_since ? (
                <p className="text-muted-foreground text-xs">
                  Rolling refresh in progress since{" "}
                  {formatTimestamp(tenant.leave_balances_stale_since)}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-3">
                {status === "connected" && tenant && recommendedSync ? (
                  <Button
                    disabled={isPending || Boolean(tenant.sync_paused_at)}
                    onClick={() =>
                      runSync(
                        organisation.id,
                        tenant.id,
                        recommendedSync.runType
                      )
                    }
                  >
                    {recommendedSync.label} now
                  </Button>
                ) : (
                  <Button
                    disabled={isPending}
                    onClick={() => handleConnect(organisation.id)}
                  >
                    {connection ? "Reconnect Xero" : "Connect Xero"}
                  </Button>
                )}
              </div>

              {tenant ? (
                <details className="rounded-xl bg-muted/30 p-4">
                  <summary className="cursor-pointer rounded-xl font-medium text-sm focus-visible:outline-[3px] focus-visible:outline-ring">
                    Manual sync options
                  </summary>
                  <div className="mt-4 flex flex-wrap gap-3">
                    {SYNC_OPTIONS.filter(
                      (option) => option.runType !== recommendedSync?.runType
                    ).map((option) => (
                      <Button
                        disabled={isPending || Boolean(tenant.sync_paused_at)}
                        key={option.runType}
                        onClick={() =>
                          runSync(organisation.id, tenant.id, option.runType)
                        }
                        variant="outline"
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>
                </details>
              ) : null}

              {connection ? (
                <details className="rounded-xl bg-muted/30 p-4">
                  <summary className="cursor-pointer rounded-xl font-medium text-sm focus-visible:outline-[3px] focus-visible:outline-ring">
                    Connection controls
                  </summary>
                  <div className="mt-4 flex flex-wrap gap-3">
                    {canRefresh ? (
                      <Button
                        disabled={isPending}
                        onClick={() =>
                          handleRefresh(connection.id, organisation.id)
                        }
                        variant="outline"
                      >
                        Refresh tokens
                      </Button>
                    ) : null}
                    {tenant ? (
                      <Button
                        disabled={isPending}
                        onClick={() =>
                          updatePauseState(
                            organisation.id,
                            tenant.id,
                            !tenant.sync_paused_at
                          )
                        }
                        variant="outline"
                      >
                        {tenant.sync_paused_at
                          ? "Resume automatic sync"
                          : "Pause automatic sync"}
                      </Button>
                    ) : null}
                    <Button
                      disabled={isPending}
                      onClick={() =>
                        setDisconnectTarget({
                          connectionId: connection.id,
                          mode: "soft",
                          organisationId: organisation.id,
                          organisationName: organisation.name,
                        })
                      }
                      variant="outline"
                    >
                      Disconnect Xero
                    </Button>
                    <Button
                      disabled={isPending}
                      onClick={() =>
                        setDisconnectTarget({
                          connectionId: connection.id,
                          mode: "destructive",
                          organisationId: organisation.id,
                          organisationName: organisation.name,
                        })
                      }
                      variant="destructive"
                    >
                      Disconnect and purge data
                    </Button>
                  </div>
                </details>
              ) : null}
            </CardContent>
          </Card>
        );
      })}

      <ConfirmActionDialog
        confirmLabel={
          disconnectTarget?.mode === "destructive"
            ? "Disconnect and purge"
            : "Disconnect Xero"
        }
        description={
          disconnectTarget?.mode === "destructive"
            ? "This disconnects Xero and permanently purges Xero-linked data. This cannot be undone."
            : "This stops future Xero access. Historical Xero data remains read-only, and you can reconnect later."
        }
        destructive
        onConfirm={handleDisconnect}
        onOpenChange={(open) => {
          if (!open) {
            setDisconnectTarget(null);
          }
        }}
        open={disconnectTarget !== null}
        pending={isPending}
        requireTyping={disconnectTarget?.organisationName}
        title={
          disconnectTarget?.mode === "destructive"
            ? "Disconnect Xero and purge data?"
            : "Disconnect Xero?"
        }
      />
    </div>
  );
};

const SYNC_OPTIONS = [
  { label: "Sync people", runType: "people" },
  { label: "Sync leave records", runType: "leave_records" },
  { label: "Sync balances", runType: "leave_balances" },
  {
    label: "Reconcile approval state",
    runType: "approval_state_reconciliation",
  },
] as const;

function recommendedSyncForTenant(
  tenant: NonNullable<
    NonNullable<
      OrganisationWithConnectionView["xero_connection"]
    >["xero_tenant"]
  >
) {
  const timestamps = {
    approval_state_reconciliation: tenant.last_approval_state_reconciled_at,
    leave_balances: tenant.last_leave_balances_sync_at,
    leave_records: tenant.last_leave_records_sync_at,
    people: tenant.last_people_sync_at,
  };
  return [...SYNC_OPTIONS].sort(
    (first, second) =>
      timestampPriority(timestamps[first.runType]) -
      timestampPriority(timestamps[second.runType])
  )[0];
}

function timestampPriority(value: Date | null) {
  return value?.getTime() ?? Number.NEGATIVE_INFINITY;
}

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
  if (
    connection.status === "pending" ||
    connection.status === "pending_tenant_selection"
  ) {
    return "error";
  }
  if (connection.status === "disconnected" || connection.disconnected_at) {
    return "disconnected";
  }
  if (connection.status === "active") {
    return "connected";
  }
  return "disconnected";
}

function formatTimestamp(value: Date | null): string {
  return value ? value.toLocaleString("en-AU") : "Not run yet";
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/30 p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-medium text-sm">{value}</p>
    </div>
  );
}
