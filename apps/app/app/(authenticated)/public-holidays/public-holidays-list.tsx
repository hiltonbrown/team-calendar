"use client";

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
import { PlusIcon, RotateCcwIcon, TrashIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/states/empty-state";
import { useFilterParams } from "@/lib/url-state/use-filter-params";
import {
  deleteCustomHolidayAction,
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
  filters: PublicHolidayFilters;
  holidays: PublicHolidayFromDB[];
  locations: Array<{ id: string; name: string }>;
}

const TYPE_CONFIG: Record<string, { label: string; bg: string; text: string }> =
  {
    public: {
      label: "Public holiday",
      bg: "color-mix(in srgb, var(--primary) 12%, transparent)",
      text: "var(--primary)",
    },
    bank: {
      label: "Bank holiday",
      bg: "color-mix(in srgb, var(--primary) 8%, transparent)",
      text: "var(--primary)",
    },
    school: {
      label: "School",
      bg: "color-mix(in srgb, var(--tertiary, var(--primary)) 12%, transparent)",
      text: "var(--tertiary, var(--primary))",
    },
    authorities: {
      label: "Authorities",
      bg: "var(--accent)",
      text: "var(--muted-foreground)",
    },
    optional: {
      label: "Optional",
      bg: "var(--accent)",
      text: "var(--muted-foreground)",
    },
    observance: {
      label: "Observance",
      bg: "var(--muted)",
      text: "var(--muted-foreground)",
    },
    custom: {
      label: "Custom",
      bg: "color-mix(in srgb, var(--primary) 12%, transparent)",
      text: "var(--primary)",
    },
  };

const FALLBACK_TYPE_CONFIG = {
  label: "Holiday",
  bg: "var(--muted)",
  text: "var(--muted-foreground)",
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
  filters,
  holidays,
  locations,
}: PublicHolidaysListProps) {
  const [isPending, startTransition] = useTransition();
  const [, setFilterParams] = useFilterParams(PublicHolidayFilterSchema);

  const handleSuppress = (id: string, orgId: string) => {
    startTransition(async () => {
      const result = await suppressHolidayAction({
        holidayId: id,
        organisationId: orgId,
      });
      if (result.ok) {
        toast.success("Holiday suppressed");
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleRestore = (id: string, orgId: string) => {
    startTransition(async () => {
      const result = await restoreHolidayAction({
        holidayId: id,
        organisationId: orgId,
      });
      if (result.ok) {
        toast.success("Holiday restored");
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleDelete = (id: string, orgId: string) => {
    startTransition(async () => {
      const result = await deleteCustomHolidayAction({
        holidayId: id,
        organisationId: orgId,
      });
      if (result.ok) {
        toast.success("Custom holiday deleted");
      } else {
        toast.error(result.error);
      }
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
        <EmptyState
          actionSlot={
            <div className="flex flex-wrap justify-center gap-3">
              <Button asChild>
                <Link href="/public-holidays/holidays/new">
                  <PlusIcon className="mr-2 h-4 w-4" /> Add custom holiday
                </Link>
              </Button>
            </div>
          }
          description="Team Calendar imports your organisation's country holidays automatically. Add a custom holiday for company-specific dates."
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

      <div className="flex justify-end gap-4">
        <Button asChild>
          <Link href="/public-holidays/holidays/new">
            <PlusIcon className="mr-2 h-4 w-4" /> Add custom holiday
          </Link>
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Day</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {holidays.map((holiday) => {
              const typeConfig =
                TYPE_CONFIG[holiday.holiday_type.toLowerCase()] ??
                FALLBACK_TYPE_CONFIG;
              const isSuppressed = holiday.archived_at !== null;

              let sourceLabel =
                holiday.source === "nager" ? "Nager.Date" : "Manual";
              if (holiday.jurisdiction?.country_code) {
                sourceLabel += ` (${holiday.jurisdiction.country_code}${holiday.jurisdiction.region_code ? `-${holiday.jurisdiction.region_code}` : ""})`;
              }

              return (
                <TableRow
                  className={cn(isSuppressed && "opacity-60")}
                  key={holiday.id}
                >
                  <TableCell
                    className={cn(
                      "whitespace-nowrap font-medium",
                      isSuppressed && "line-through"
                    )}
                  >
                    {formatDate(new Date(holiday.holiday_date))}
                  </TableCell>
                  <TableCell className={cn(isSuppressed && "line-through")}>
                    {formatDayOfWeek(new Date(holiday.holiday_date))}
                  </TableCell>
                  <TableCell className={cn(isSuppressed && "line-through")}>
                    {holiday.name}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={cn(
                        "whitespace-nowrap font-normal",
                        isSuppressed && "opacity-50"
                      )}
                      style={{
                        backgroundColor: typeConfig.bg,
                        color: typeConfig.text,
                      }}
                      variant="secondary"
                    >
                      {typeConfig.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {sourceLabel}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {isSuppressed ? (
                        <Button
                          aria-label={`Restore ${holiday.name}`}
                          disabled={isPending}
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
                          disabled={isPending}
                          onClick={() =>
                            handleSuppress(holiday.id, holiday.organisation_id)
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
                          disabled={isPending}
                          onClick={() =>
                            handleDelete(holiday.id, holiday.organisation_id)
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
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
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
