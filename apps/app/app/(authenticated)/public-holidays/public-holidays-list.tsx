"use client";

import type { ResolvedPublicHoliday } from "@repo/availability";
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
  BriefcaseIcon,
  CalendarOffIcon,
  EyeOffIcon,
  PlusIcon,
  RotateCcwIcon,
  TrashIcon,
} from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/states/empty-state";
import { useFilterParams } from "@/lib/url-state/use-filter-params";
import {
  deleteCustomHolidayAction,
  hideHolidayAction,
  restoreHolidayAction,
  setHolidayClassificationAction,
  setLocalHolidayEnabledAction,
} from "./_actions";
import {
  HOLIDAY_YEAR_OPTIONS,
  PublicHolidayFilterSchema,
  type PublicHolidayFilters,
} from "./_schemas";

// Radix Select rejects empty-string item values, so the "no filter" option
// carries this sentinel and maps back to undefined at the state boundary.
const ALL_LOCATIONS = "all";
const CUSTOM_PREFIX = "custom:";

export interface HolidayGroup {
  holidays: ResolvedPublicHoliday[];
  /** null is the organisation level, for people without a location. */
  locationId: string | null;
  name: string;
}

interface PublicHolidaysListProps {
  canManage: boolean;
  filters: PublicHolidayFilters;
  groups: HolidayGroup[];
  hasOfficialHolidays: boolean;
  locations: Array<{ id: string; name: string }>;
  organisationId: string;
}

type Confirmation =
  | { action: "delete"; holiday: ResolvedPublicHoliday }
  | { action: "hide"; holiday: ResolvedPublicHoliday };

type ActionResult =
  | { ok: true; value: { message: string } }
  | { error: string; ok: false };

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00.000Z`).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    weekday: "long",
    year: "numeric",
  });
}

function kindLabel(holiday: ResolvedPublicHoliday): string {
  if (holiday.kind === "part_day") {
    return `Part day from ${holiday.startsAt ?? ""}`;
  }
  if (holiday.kind === "local") {
    return `Local: ${holiday.area ?? ""}`;
  }
  return holiday.kind === "custom" ? "Custom" : "Public holiday";
}

/** The classification a holiday has before any location override. */
function defaultClassification(holiday: ResolvedPublicHoliday) {
  return holiday.kind === "part_day" ? "working" : "non_working";
}

export function PublicHolidaysList({
  canManage,
  filters,
  groups,
  hasOfficialHolidays,
  locations,
  organisationId,
}: PublicHolidaysListProps) {
  const [isPending, startTransition] = useTransition();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [, setFilterParams] = useFilterParams(PublicHolidayFilterSchema);

  const run = (rowKey: string, action: () => Promise<ActionResult>) => {
    setPendingKey(rowKey);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(result.value.message);
        setConfirmation(null);
      } else {
        toast.error(result.error);
      }
      setPendingKey(null);
    });
  };

  const confirm = () => {
    if (!confirmation) {
      return;
    }
    const { holiday } = confirmation;
    run(`${holiday.locationId}:${holiday.key}`, () =>
      confirmation.action === "hide"
        ? hideHolidayAction({ holidayKey: holiday.key, organisationId })
        : deleteCustomHolidayAction({
            holidayId: holiday.key.slice(CUSTOM_PREFIX.length),
            name: holiday.name,
            organisationId,
          })
    );
  };

  const isEmpty = groups.every((group) => group.holidays.length === 0);

  return (
    <div className="flex flex-col gap-6">
      <FilterBar
        filters={filters}
        locations={locations}
        setFilterParams={setFilterParams}
      />
      {canManage ? <ManagementBar organisationId={organisationId} /> : null}

      {isEmpty && !hasOfficialHolidays ? (
        <EmptyState
          description={`Official holidays for ${filters.year} are not available yet. They are added each year in September. You can add a custom holiday in the meantime.`}
          title={`No public holidays for ${filters.year}`}
        />
      ) : (
        groups.map((group) => (
          <section
            aria-label={`Public holidays for ${group.name}`}
            className="rounded-2xl bg-muted p-3 xl:p-0"
            key={group.locationId ?? "organisation"}
          >
            <h2 className="px-1 pb-2 font-semibold text-title-sm xl:px-4 xl:pt-4">
              {group.name}
            </h2>
            {group.holidays.length === 0 ? (
              <p className="px-1 pb-3 text-body-sm text-muted-foreground xl:px-4 xl:pb-4">
                No public holidays apply here in {filters.year}.
              </p>
            ) : (
              <HolidayTable
                canManage={canManage}
                group={group}
                onConfirm={setConfirmation}
                onRun={run}
                organisationId={organisationId}
                pendingKey={pendingKey}
              />
            )}
          </section>
        ))
      )}

      <HolidayConfirmation
        confirmation={confirmation}
        disabled={isPending}
        onCancel={() => setConfirmation(null)}
        onConfirm={confirm}
      />
    </div>
  );
}

function HolidayTable({
  canManage,
  group,
  onConfirm,
  onRun,
  organisationId,
  pendingKey,
}: {
  canManage: boolean;
  group: HolidayGroup;
  onConfirm: (confirmation: Confirmation) => void;
  onRun: (rowKey: string, action: () => Promise<ActionResult>) => void;
  organisationId: string;
  pendingKey: string | null;
}) {
  return (
    <Table className="block w-full xl:table">
      <TableHeader className="sr-only xl:table-header-group">
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Day</TableHead>
          {canManage ? (
            <TableHead className="text-right">Actions</TableHead>
          ) : null}
        </TableRow>
      </TableHeader>
      <TableBody className="block space-y-3 xl:table-row-group xl:space-y-0">
        {group.holidays.map((holiday) => {
          const rowKey = `${holiday.locationId}:${holiday.key}`;
          return (
            <TableRow
              className={cn(
                "grid gap-3 rounded-2xl bg-background p-4 xl:table-row xl:rounded-none xl:bg-transparent xl:p-0",
                holiday.hidden && "text-muted-foreground"
              )}
              key={rowKey}
            >
              <Cell label="Date">{formatDate(holiday.date)}</Cell>
              <Cell label="Name">{holiday.name}</Cell>
              <Cell label="Type">
                <div className="flex flex-wrap gap-2">
                  <Badge
                    className="whitespace-nowrap font-normal"
                    variant="secondary"
                  >
                    {kindLabel(holiday)}
                  </Badge>
                  {holiday.hidden ? (
                    <Badge variant="outline">Hidden</Badge>
                  ) : null}
                </div>
              </Cell>
              <Cell label="Source">
                {holiday.origin === "custom" ? "Custom" : "Official"}
              </Cell>
              <Cell label="Day">
                {holiday.classification === "working"
                  ? "Working day"
                  : "Day off"}
              </Cell>
              {canManage ? (
                <TableCell className="xl:table-cell xl:p-2 xl:text-right">
                  <HolidayActions
                    disabled={pendingKey === rowKey}
                    holiday={holiday}
                    locationId={group.locationId}
                    onConfirm={onConfirm}
                    onRun={(action) => onRun(rowKey, action)}
                    organisationId={organisationId}
                  />
                </TableCell>
              ) : null}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function Cell({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <TableCell className="whitespace-normal break-words xl:table-cell xl:p-2">
      <span className="mb-1 block text-label-md text-muted-foreground xl:hidden">
        {label}
      </span>
      {children}
    </TableCell>
  );
}

function HolidayActions({
  disabled,
  holiday,
  locationId,
  onConfirm,
  onRun,
  organisationId,
}: {
  disabled: boolean;
  holiday: ResolvedPublicHoliday;
  locationId: string | null;
  onConfirm: (confirmation: Confirmation) => void;
  onRun: (action: () => Promise<ActionResult>) => void;
  organisationId: string;
}) {
  if (holiday.hidden) {
    return (
      <div className="flex justify-end gap-2">
        <Button
          aria-label={`Restore ${holiday.name}`}
          disabled={disabled}
          onClick={() =>
            onRun(() =>
              restoreHolidayAction({
                holidayKey: holiday.key,
                locationId: null,
                organisationId,
              })
            )
          }
          size="icon"
          title="Restore holiday"
          variant="ghost"
        >
          <RotateCcwIcon className="size-4" />
        </Button>
      </div>
    );
  }
  const isOverridden =
    locationId !== null &&
    holiday.kind !== "local" &&
    holiday.classification !== defaultClassification(holiday);
  const nextClassification =
    holiday.classification === "working" ? "non_working" : "working";
  return (
    <div className="flex justify-end gap-2">
      {locationId ? (
        <Button
          aria-label={`Mark ${holiday.name} as ${nextClassification === "working" ? "a working day" : "a non-working day"}`}
          disabled={disabled}
          onClick={() =>
            onRun(() =>
              setHolidayClassificationAction({
                classification: nextClassification,
                holidayKey: holiday.key,
                locationId,
                organisationId,
              })
            )
          }
          size="icon"
          title={
            nextClassification === "working"
              ? "Mark as working day"
              : "Mark as non-working day"
          }
          variant="ghost"
        >
          {nextClassification === "working" ? (
            <BriefcaseIcon className="size-4" />
          ) : (
            <CalendarOffIcon className="size-4" />
          )}
        </Button>
      ) : null}
      {isOverridden ? (
        <Button
          aria-label={`Reset ${holiday.name} to its default`}
          disabled={disabled}
          onClick={() =>
            onRun(() =>
              restoreHolidayAction({
                holidayKey: holiday.key,
                locationId,
                organisationId,
              })
            )
          }
          size="icon"
          title="Reset to default"
          variant="ghost"
        >
          <RotateCcwIcon className="size-4" />
        </Button>
      ) : null}
      {holiday.kind === "local" && locationId ? (
        // Local days are switched on per location, so they are switched off
        // the same way rather than hidden organisation-wide.
        <Button
          aria-label={`Switch off ${holiday.name} for this location`}
          disabled={disabled}
          onClick={() =>
            onRun(() =>
              setLocalHolidayEnabledAction({
                enabled: false,
                holidayKey: holiday.key,
                locationId,
                organisationId,
              })
            )
          }
          size="icon"
          title="Switch off for this location"
          variant="ghost"
        >
          <EyeOffIcon className="size-4" />
        </Button>
      ) : (
        <Button
          aria-label={`Hide ${holiday.name}`}
          disabled={disabled}
          onClick={() => onConfirm({ action: "hide", holiday })}
          size="icon"
          title="Hide for all locations"
          variant="ghost"
        >
          <EyeOffIcon className="size-4" />
        </Button>
      )}
      {holiday.origin === "custom" ? (
        <Button
          aria-label={`Delete ${holiday.name}`}
          disabled={disabled}
          onClick={() => onConfirm({ action: "delete", holiday })}
          size="icon"
          title="Delete custom holiday"
          variant="ghost"
        >
          <TrashIcon className="size-4 text-destructive" />
        </Button>
      ) : null}
    </div>
  );
}

function ManagementBar({ organisationId }: { organisationId: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-muted p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium text-body-sm">Holiday administration</p>
        <p className="mt-1 text-body-sm text-muted-foreground">
          Official holidays apply automatically for each location&apos;s state
          or region. Switch on local days in{" "}
          <Link
            className="underline"
            href={`/settings/holidays?org=${organisationId}`}
          >
            Settings, Holidays
          </Link>
          .
        </p>
      </div>
      <Button asChild>
        <Link href={`/public-holidays/holidays/new?org=${organisationId}`}>
          <PlusIcon className="size-4" /> Add custom holiday
        </Link>
      </Button>
    </div>
  );
}

function HolidayConfirmation({
  confirmation,
  disabled,
  onCancel,
  onConfirm,
}: {
  confirmation: Confirmation | null;
  disabled: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isDelete = confirmation?.action === "delete";
  let confirmLabel = isDelete ? "Delete holiday" : "Hide holiday";
  if (disabled) {
    confirmLabel = "Updating…";
  }
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
            {isDelete ? "Delete" : "Hide"} {confirmation?.holiday.name}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isDelete
              ? "This custom holiday will be deleted and removed from calendars and future feeds. This cannot be undone."
              : "This holiday will be hidden for every location and removed from calendars and future feeds. You can restore it by including hidden holidays."}
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
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
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
      <label
        className="flex flex-col gap-1 text-label-lg"
        htmlFor="holiday-year-filter"
      >
        <span className="font-medium">Year</span>
        <Select
          defaultValue={String(filters.year)}
          onValueChange={(value) => setFilterParams({ year: Number(value) })}
        >
          <SelectTrigger
            className="min-h-11 min-w-28 rounded-xl bg-background"
            id="holiday-year-filter"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {HOLIDAY_YEAR_OPTIONS.map((year) => (
              <SelectItem key={year} value={String(year)}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <label
        className="flex flex-col gap-1 text-label-lg"
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
      <label className="flex min-h-11 items-center gap-2 text-label-lg">
        <input
          checked={filters.includeHidden}
          onChange={(event) =>
            setFilterParams({ includeHidden: event.currentTarget.checked })
          }
          type="checkbox"
        />
        <span className="font-medium">Include hidden</span>
      </label>
    </div>
  );
}
