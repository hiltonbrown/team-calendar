"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/design-system/components/ui/alert-dialog";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/design-system/components/ui/table";
import { cn } from "@repo/design-system/lib/utils";
import {
  DownloadIcon,
  PlusIcon,
  RotateCcwIcon,
  TrashIcon,
  XIcon,
} from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/states/empty-state";
import { useFilterParams } from "@/lib/url-state/use-filter-params";
import {
  deleteCustomHolidayAction,
  importFromSourceAction,
  restoreHolidayAction,
  suppressHolidayAction,
} from "./_actions";
import {
  PublicHolidayFilterSchema,
  type PublicHolidayFilters,
} from "./_schemas";

// Radix Select rejects empty-string item values, so the "no filter" option
// carries this sentinel and maps back to undefined at the state boundary.
const ALL_LOCATIONS = "all";

interface PublicHolidayFromDB {
  archived_at: Date | null;
  holiday_date: Date;
  holiday_type: string;
  id: string;
  jurisdiction?: {
    country_code: string;
    region_code: string | null;
  } | null;
  name: string;
  organisation_id: string;
  source: "nager" | "manual";
}

interface PublicHolidaysListProps {
  canManage: boolean;
  filters: PublicHolidayFilters;
  holidays: PublicHolidayFromDB[];
  locations: Array<{ id: string; name: string }>;
  organisationId: string;
  refreshTargets: Array<{
    countryCode: string;
    label: string;
    regionCode: string | null;
  }>;
}

type ConfirmedAction = "delete" | "suppress";

const TYPE_CONFIG: Record<string, { className: string; label: string }> = {
  authorities: {
    className: "bg-muted text-muted-foreground",
    label: "Authorities",
  },
  bank: {
    className: "bg-primary/10 text-primary",
    label: "Bank holiday",
  },
  custom: {
    className: "bg-primary/10 text-primary",
    label: "Custom",
  },
  observance: {
    className: "bg-muted text-muted-foreground",
    label: "Observance",
  },
  optional: {
    className: "bg-muted text-muted-foreground",
    label: "Optional",
  },
  public: {
    className: "bg-primary/10 text-primary",
    label: "Public holiday",
  },
  school: {
    className: "bg-tertiary/10 text-tertiary",
    label: "School",
  },
};

const FALLBACK_TYPE_CONFIG = {
  className: "bg-muted text-muted-foreground",
  label: "Holiday",
};

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDayOfWeek(date: Date): string {
  return date.toLocaleDateString("en-GB", { weekday: "long" });
}

export function PublicHolidaysList({
  canManage,
  filters,
  holidays,
  locations,
  organisationId,
  refreshTargets,
}: PublicHolidaysListProps) {
  const [isPending, startTransition] = useTransition();
  const [pendingHolidayId, setPendingHolidayId] = useState<string | null>(null);
  const [refreshPending, setRefreshPending] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    action: ConfirmedAction;
    holiday: PublicHolidayFromDB;
  } | null>(null);
  const [, setFilterParams] = useFilterParams(PublicHolidayFilterSchema);

  const executeConfirmedAction = () => {
    if (!confirmation) {
      return;
    }
    const { action, holiday } = confirmation;
    setPendingHolidayId(holiday.id);
    startTransition(async () => {
      const result =
        action === "suppress"
          ? await suppressHolidayAction({
              holidayId: holiday.id,
              organisationId: holiday.organisation_id,
            })
          : await deleteCustomHolidayAction({
              holidayId: holiday.id,
              organisationId: holiday.organisation_id,
            });
      if (result.ok) {
        toast.success(
          action === "suppress"
            ? `${holiday.name} suppressed and removed from future calendar publication.`
            : `${holiday.name} permanently deleted.`
        );
        setConfirmation(null);
      } else {
        toast.error(result.error);
      }
      setPendingHolidayId(null);
    });
  };

  const handleRestore = (id: string, orgId: string) => {
    setPendingHolidayId(id);
    startTransition(async () => {
      const result = await restoreHolidayAction({
        holidayId: id,
        organisationId: orgId,
      });
      if (result.ok) {
        toast.success("Holiday restored to calendars and future feeds.");
      } else {
        toast.error(result.error);
      }
      setPendingHolidayId(null);
    });
  };

  const handleRefresh = () => {
    setRefreshPending(true);
    startTransition(async () => {
      let importedCount = 0;
      let skippedCount = 0;
      for (const target of refreshTargets) {
        const result = await importFromSourceAction({
          countryCode: target.countryCode,
          organisationId,
          regionCode: target.regionCode,
          year: filters.year,
        });
        if (!result.ok) {
          toast.error(`Could not refresh ${target.label}: ${result.error}`);
          setRefreshPending(false);
          return;
        }
        importedCount += result.value.importedCount;
        skippedCount += result.value.skippedCount;
      }
      toast.success(
        `Holiday source refreshed: ${importedCount} added, ${skippedCount} already current.`
      );
      setRefreshPending(false);
    });
  };

  if (holidays.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <FilterBar
          filters={filters}
          locations={locations}
          setFilterParams={setFilterParams}
        />
        {canManage ? (
          <ManagementActions
            onRefresh={handleRefresh}
            refreshPending={refreshPending}
            refreshTargets={refreshTargets}
          />
        ) : null}
        <EmptyState
          description="Refresh your organisation's country holidays from the source, or add a custom date for a company-specific holiday."
          title="No public holidays"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <FilterBar
        filters={filters}
        locations={locations}
        setFilterParams={setFilterParams}
      />

      {canManage ? (
        <ManagementActions
          onRefresh={handleRefresh}
          refreshPending={refreshPending}
          refreshTargets={refreshTargets}
        />
      ) : null}

      <section
        aria-label="Public holiday details and management actions"
        className="rounded-2xl bg-muted p-3 xl:p-0"
      >
        <Table className="block w-full xl:table">
          <TableHeader className="sr-only xl:table-header-group">
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Day</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Source</TableHead>
              {canManage ? (
                <TableHead className="text-right">Actions</TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody className="block space-y-3 xl:table-row-group xl:space-y-0">
            {holidays.map((holiday) => {
              const typeConfig =
                TYPE_CONFIG[holiday.holiday_type.toLowerCase()] ??
                FALLBACK_TYPE_CONFIG;
              const isSuppressed = holiday.archived_at !== null;

              return (
                <TableRow
                  className={cn(
                    "grid gap-3 rounded-2xl bg-background p-4 xl:table-row xl:rounded-none xl:bg-transparent xl:p-0",
                    isSuppressed && "opacity-60"
                  )}
                  key={holiday.id}
                >
                  <TableCell
                    className={cn(
                      "whitespace-normal font-medium xl:table-cell xl:whitespace-nowrap xl:p-2",
                      isSuppressed && "line-through"
                    )}
                  >
                    <span className="mb-1 block text-muted-foreground text-xs xl:hidden">
                      Date
                    </span>
                    {formatDate(new Date(holiday.holiday_date))}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "xl:table-cell xl:p-2",
                      isSuppressed && "line-through"
                    )}
                  >
                    <span className="mb-1 block text-muted-foreground text-xs xl:hidden">
                      Day
                    </span>
                    {formatDayOfWeek(new Date(holiday.holiday_date))}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "whitespace-normal break-words xl:table-cell xl:p-2",
                      isSuppressed && "line-through"
                    )}
                  >
                    <span className="mb-1 block text-muted-foreground text-xs xl:hidden">
                      Name
                    </span>
                    {holiday.name}
                  </TableCell>
                  <TableCell className="xl:table-cell xl:p-2">
                    <span className="mb-1 block text-muted-foreground text-xs xl:hidden">
                      Type
                    </span>
                    <div className="flex flex-wrap gap-2">
                      <Badge
                        className={cn(
                          "whitespace-nowrap font-normal",
                          typeConfig.className,
                          isSuppressed && "opacity-50"
                        )}
                        variant="secondary"
                      >
                        {typeConfig.label}
                      </Badge>
                      {isSuppressed ? (
                        <Badge variant="secondary">Suppressed</Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-normal text-muted-foreground text-sm xl:table-cell xl:p-2">
                    <span className="mb-1 block text-xs xl:hidden">Source</span>
                    {sourceLabelForHoliday(holiday)}
                  </TableCell>
                  {canManage ? (
                    <TableCell className="xl:table-cell xl:p-2 xl:text-right">
                      <div className="flex justify-end gap-2">
                        {isSuppressed ? (
                          <Button
                            aria-label={`Restore ${holiday.name}`}
                            disabled={pendingHolidayId === holiday.id}
                            onClick={() =>
                              handleRestore(holiday.id, holiday.organisation_id)
                            }
                            size="icon"
                            title="Restore holiday"
                            variant="ghost"
                          >
                            <RotateCcwIcon className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button
                            aria-label={`Suppress ${holiday.name}`}
                            disabled={pendingHolidayId === holiday.id}
                            onClick={() =>
                              setConfirmation({ action: "suppress", holiday })
                            }
                            size="icon"
                            title="Suppress holiday"
                            variant="ghost"
                          >
                            <XIcon className="h-4 w-4" />
                          </Button>
                        )}
                        {holiday.source === "manual" && (
                          <Button
                            aria-label={`Delete ${holiday.name}`}
                            disabled={pendingHolidayId === holiday.id}
                            onClick={() =>
                              setConfirmation({ action: "delete", holiday })
                            }
                            size="icon"
                            title="Delete custom holiday"
                            variant="ghost"
                          >
                            <TrashIcon className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </section>
      <HolidayConfirmation
        confirmation={confirmation}
        disabled={isPending}
        onCancel={() => setConfirmation(null)}
        onConfirm={executeConfirmedAction}
      />
    </div>
  );
}

function ManagementActions({
  onRefresh,
  refreshPending,
  refreshTargets,
}: {
  onRefresh: () => void;
  refreshPending: boolean;
  refreshTargets: PublicHolidaysListProps["refreshTargets"];
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-muted p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium text-sm">Holiday administration</p>
        <p className="mt-1 text-muted-foreground text-sm">
          Refresh {refreshTargets.map((target) => target.label).join(", ")} for
          the selected year, or add a company-specific date.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          aria-busy={refreshPending}
          disabled={refreshPending || refreshTargets.length === 0}
          onClick={onRefresh}
          type="button"
          variant="secondary"
        >
          <DownloadIcon className="size-4" />
          {refreshPending ? "Refreshing…" : "Refresh from source"}
        </Button>
        <Button asChild>
          <Link href="/public-holidays/holidays/new">
            <PlusIcon className="size-4" /> Add custom holiday
          </Link>
        </Button>
      </div>
    </div>
  );
}

function HolidayConfirmation({
  confirmation,
  disabled,
  onCancel,
  onConfirm,
}: {
  confirmation: {
    action: ConfirmedAction;
    holiday: PublicHolidayFromDB;
  } | null;
  disabled: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isDelete = confirmation?.action === "delete";
  const confirmationLabel = confirmationButtonLabel(isDelete, disabled);
  return (
    <AlertDialog
      onOpenChange={(open) => {
        if (!(open || disabled)) {
          onCancel();
        }
      }}
      open={confirmation !== null}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isDelete ? "Permanently delete" : "Suppress"}{" "}
            {confirmation?.holiday.name}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isDelete
              ? "This custom holiday will be permanently deleted and removed from calendars and future feed publication. This cannot be undone."
              : "This holiday will be removed from calendars and future feed publication. You can restore it later by including suppressed holidays."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={disabled}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={
              isDelete
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : undefined
            }
            disabled={disabled}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            {confirmationLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function confirmationButtonLabel(isDelete: boolean, disabled: boolean) {
  if (disabled) {
    return "Updating…";
  }
  return isDelete ? "Delete permanently" : "Suppress holiday";
}

function sourceLabelForHoliday(holiday: PublicHolidayFromDB) {
  let label = holiday.source === "nager" ? "Nager.Date" : "Manual";
  if (holiday.jurisdiction?.country_code) {
    label += ` (${holiday.jurisdiction.country_code}${holiday.jurisdiction.region_code ? `-${holiday.jurisdiction.region_code}` : ""})`;
  }
  return label;
}

function FilterBar({
  filters,
  locations,
  setFilterParams,
}: {
  filters: PublicHolidayFilters;
  locations: Array<{ id: string; name: string }>;
  setFilterParams: (params: Partial<PublicHolidayFilters>) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-2xl bg-muted p-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Year</span>
        <input
          className="min-h-11 rounded-xl bg-background px-3 py-2"
          defaultValue={filters.year}
          min={2000}
          onChange={(event) =>
            setFilterParams({ year: Number(event.currentTarget.value) })
          }
          type="number"
        />
      </label>
      <label
        className="flex flex-col gap-1 text-sm"
        htmlFor="holiday-location-filter"
      >
        <span className="font-medium">Location</span>
        <Select
          defaultValue={filters.locationId ?? ALL_LOCATIONS}
          onValueChange={(value) =>
            setFilterParams({
              locationId: value === ALL_LOCATIONS ? undefined : value,
            })
          }
        >
          <SelectTrigger
            className="min-h-11 min-w-44 rounded-xl bg-background"
            id="holiday-location-filter"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_LOCATIONS}>All locations</SelectItem>
            {locations.map((location) => (
              <SelectItem key={location.id} value={location.id}>
                {location.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          checked={filters.includeSuppressed}
          onChange={(event) =>
            setFilterParams({
              includeSuppressed: event.currentTarget.checked,
            })
          }
          type="checkbox"
        />
        <span className="font-medium">Include suppressed</span>
      </label>
    </div>
  );
}
