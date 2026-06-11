"use client";

import type { AuditEventDetail, AuditEventListItem } from "@repo/availability";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { Input } from "@repo/design-system/components/ui/input";
import { toast } from "@repo/design-system/components/ui/sonner";
import { useState, useTransition } from "react";
import { SettingsSectionHeader } from "../components/settings-section-header";
import { exportAuditLogCsvAction } from "./_actions";

interface AuditLogClientProps {
  details: Record<string, AuditEventDetail>;
  events: AuditEventListItem[];
  filters: {
    actionPrefix: string;
    dateFrom: string;
    dateTo: string;
    searchEntityId: string;
  };
  nextCursor: null | string;
  organisationId: string;
}

export const AuditLogClient = ({
  details,
  events,
  filters,
  organisationId,
}: AuditLogClientProps) => {
  const [isPending, startTransition] = useTransition();
  const [exporting, setExporting] = useState(false);

  const exportCsv = () => {
    setExporting(true);
    startTransition(async () => {
      const result = await exportAuditLogCsvAction({
        filters: {
          actionPrefix: filters.actionPrefix || undefined,
          dateFrom: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
          dateTo: filters.dateTo ? new Date(filters.dateTo) : undefined,
          searchEntityId: filters.searchEntityId || undefined,
        },
        organisationId,
      });

      setExporting(false);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }

      const blob = new Blob([result.value.csvContent], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.value.filename;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Audit log export ready.");
    });
  };

  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        action={
          <Button disabled={exporting || isPending} onClick={exportCsv}>
            Export CSV
          </Button>
        }
        description="All system and user actions for this organisation."
        title="Audit Log"
      />

      <Card className="rounded-2xl">
        <CardContent className="p-4">
          <form className="grid items-end gap-4 md:grid-cols-5" method="get">
            <label className="grid gap-1 text-sm" htmlFor="audit-date-from">
              <span className="text-muted-foreground">From</span>
              <Input
                defaultValue={filters.dateFrom}
                id="audit-date-from"
                name="dateFrom"
                type="date"
              />
            </label>
            <label className="grid gap-1 text-sm" htmlFor="audit-date-to">
              <span className="text-muted-foreground">To</span>
              <Input
                defaultValue={filters.dateTo}
                id="audit-date-to"
                name="dateTo"
                type="date"
              />
            </label>
            <label className="grid gap-1 text-sm" htmlFor="audit-action-prefix">
              <span className="text-muted-foreground">Action prefix</span>
              <Input
                defaultValue={filters.actionPrefix}
                id="audit-action-prefix"
                name="actionPrefix"
                placeholder="e.g. leave_request."
              />
            </label>
            <label className="grid gap-1 text-sm" htmlFor="audit-entity-id">
              <span className="text-muted-foreground">Entity ID</span>
              <Input
                defaultValue={filters.searchEntityId}
                id="audit-entity-id"
                name="entityId"
                placeholder="Entity ID"
              />
            </label>
            <Button type="submit" variant="secondary">
              Apply filters
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>{events.length} events</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {events.map((event) => (
            <details className="rounded-xl bg-muted/30 p-4" key={event.id}>
              <summary className="cursor-pointer list-none">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-sm">{event.action}</p>
                    <p className="text-muted-foreground text-xs">
                      {event.entityType} · {event.entityId} ·{" "}
                      {event.actorDisplay}
                    </p>
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {event.createdAt.toLocaleString("en-AU")}
                  </div>
                </div>
              </summary>
              <div className="mt-4 space-y-3 text-sm">
                <pre className="overflow-x-auto rounded-lg bg-background p-3 text-xs">
                  {JSON.stringify(event.metadata, null, 2)}
                </pre>
                {details[event.id] && (
                  <div className="grid gap-3 md:grid-cols-2">
                    <pre className="overflow-x-auto rounded-lg bg-background p-3 text-xs">
                      {JSON.stringify(details[event.id].beforeValue, null, 2)}
                    </pre>
                    <pre className="overflow-x-auto rounded-lg bg-background p-3 text-xs">
                      {JSON.stringify(details[event.id].afterValue, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </details>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};
