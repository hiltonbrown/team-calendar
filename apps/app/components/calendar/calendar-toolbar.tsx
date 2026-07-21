"use client";

import type { CalendarPerson, CalendarRange } from "@repo/availability";
import { Button } from "@repo/design-system/components/ui/button";
import { ButtonGroup } from "@repo/design-system/components/ui/button-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@repo/design-system/components/ui/sheet";
import {
  ChartNoAxesCombinedIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Grid2X2Icon,
  PlusIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { labelForValue } from "@/components/availability/availability-status";
import { withOrg } from "@/lib/navigation/org-url";
import { useFilterParams } from "@/lib/url-state/use-filter-params";
import {
  type CalendarFilterInput,
  CalendarFilterSchema,
} from "../../app/(authenticated)/calendar/_schemas";

interface Option {
  id: string;
  name: string;
}

interface CalendarToolbarProps {
  actingPersonId: string | null;
  data: CalendarRange;
  filters: CalendarFilterInput;
  locations: Option[];
  orgQueryValue: string | null;
  teams: Option[];
}

export function CalendarToolbar({
  actingPersonId,
  data,
  filters,
  locations,
  orgQueryValue,
  teams,
}: CalendarToolbarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, setFilterParams] = useFilterParams(CalendarFilterSchema);
  const anchor =
    filters.anchor ?? data.days[0]?.date.toISOString().slice(0, 10);
  const selectedPersonId =
    filters.scopeType === "person" ? filters.scopeValue : actingPersonId;

  const update = (patch: Partial<CalendarFilterInput>) => {
    setFilterParams(patch);
  };

  const shift = (direction: -1 | 1) => {
    if (!anchor) {
      return;
    }
    if (filters.view === "month") {
      update({ anchor: addMonths(anchor, direction) });
      return;
    }
    update({
      anchor: addDays(anchor, direction * (filters.view === "week" ? 7 : 1)),
    });
  };

  const today = dateOnlyInTimeZone(new Date(), data.range.timezone);
  const activeFilters = activeFilterLabels({
    filters,
    locations,
    teams,
  });
  const appliedFilterCount = countAppliedFilters(filters);
  const rangeLabel =
    filters.surface === "coverage" ? "Coverage range" : "Calendar range";

  return (
    <div className="rounded-2xl bg-muted p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            aria-label={`Previous ${rangeUnit(filters.view)}`}
            onClick={() => shift(-1)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
          <div className="min-w-52 text-center font-semibold">
            {periodLabel(data)}
          </div>
          <Button
            aria-label={`Next ${rangeUnit(filters.view)}`}
            onClick={() => shift(1)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <ChevronRightIcon className="size-4" />
          </Button>
          <Button
            onClick={() => update({ anchor: today })}
            type="button"
            variant="secondary"
          >
            Today
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ButtonGroup aria-label="View">
            <Button
              aria-pressed={filters.surface === "calendar"}
              onClick={() => update({ surface: "calendar" })}
              size="sm"
              type="button"
              variant={filters.surface === "calendar" ? "secondary" : "ghost"}
            >
              <Grid2X2Icon className="size-4" />
              Calendar
            </Button>
            <Button
              aria-pressed={filters.surface === "coverage"}
              onClick={() => update({ surface: "coverage" })}
              size="sm"
              type="button"
              variant={filters.surface === "coverage" ? "secondary" : "ghost"}
            >
              <ChartNoAxesCombinedIcon className="size-4" />
              Coverage
            </Button>
          </ButtonGroup>
          <Select
            onValueChange={(value) => update({ view: parseView(value) })}
            value={filters.view}
          >
            <SelectTrigger aria-label={rangeLabel} className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Day</SelectItem>
              <SelectItem value="week">Week</SelectItem>
              <SelectItem value="month">Month</SelectItem>
            </SelectContent>
          </Select>

          <ScopeSelect
            filters={filters}
            people={data.people}
            setFilterParams={update}
            teams={teams}
          />

          <FilterSheet
            appliedFilterCount={appliedFilterCount}
            filters={filters}
            locations={locations}
            setFilterParams={update}
          />

          <Button
            onClick={() => {
              const params = new URLSearchParams(
                Array.from(searchParams.entries())
              );
              params.set("startsAt", today);
              if (selectedPersonId) {
                params.set("personId", selectedPersonId);
              }
              router.push(
                withOrg(`/plans/new?${params.toString()}`, orgQueryValue)
              );
            }}
            type="button"
          >
            <PlusIcon className="size-4" />
            Add leave or availability
          </Button>
        </div>
      </div>
      <ActiveFilterSummary labels={activeFilters} />
    </div>
  );
}

function ScopeSelect({
  filters,
  people,
  setFilterParams,
  teams,
}: {
  filters: CalendarFilterInput;
  people: readonly CalendarPerson[];
  setFilterParams: (patch: Partial<CalendarFilterInput>) => void;
  teams: Option[];
}) {
  const value =
    filters.scopeType === "team" || filters.scopeType === "person"
      ? `${filters.scopeType}:${filters.scopeValue ?? ""}`
      : (filters.scopeType ?? "my_self");
  return (
    <Select
      onValueChange={(nextValue) => {
        const [scopeType, scopeValue] = nextValue.split(":");
        setFilterParams({
          scopeType: parseScopeType(scopeType),
          scopeValue: scopeValue || undefined,
        });
      }}
      value={value}
    >
      <SelectTrigger aria-label="People shown" className="w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="my_self">Myself</SelectItem>
        <SelectItem value="my_team">My team</SelectItem>
        <SelectItem value="all_teams">All teams</SelectItem>
        {teams.map((team) => (
          <SelectItem key={team.id} value={`team:${team.id}`}>
            {team.name}
          </SelectItem>
        ))}
        {people.map((person) => (
          <SelectItem key={person.id} value={`person:${person.id}`}>
            {person.displayName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ActiveFilterSummary({ labels }: { labels: ActiveFilterLabel[] }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">Currently showing</span>
      {labels.map(({ label, value }) => (
        <span
          className="rounded-xl bg-background px-2.5 py-1 font-medium text-foreground"
          key={label}
        >
          <span className="text-muted-foreground">{label}: </span>
          {value}
        </span>
      ))}
    </div>
  );
}

function activeFilterLabels({
  filters,
  locations,
  teams,
}: {
  filters: CalendarFilterInput;
  locations: Option[];
  teams: Option[];
}) {
  const labels: ActiveFilterLabel[] = [
    {
      label: "View",
      value: filters.surface === "coverage" ? "Coverage" : "Calendar",
    },
    { label: "Range", value: labelForValue(filters.view) },
    { label: "People", value: scopeLabel(filters, teams) },
    {
      label: "Records",
      value: recordCategoryLabel(filters.recordTypeCategory),
    },
  ];
  if (filters.approvalStatus?.[0]) {
    labels.push({
      label: "Status",
      value: labelForValue(filters.approvalStatus[0]),
    });
  }
  if (filters.personType?.[0]) {
    labels.push({
      label: "People type",
      value: labelForValue(filters.personType[0]),
    });
  }
  const location = locations.find(
    (option) => option.id === filters.locationId?.[0]
  );
  if (location) {
    labels.push({ label: "Location", value: location.name });
  }
  if (filters.includeDrafts) {
    labels.push({ label: "Drafts", value: "Included" });
  }
  return labels;
}

function scopeLabel(filters: CalendarFilterInput, teams: Option[]) {
  if (filters.scopeType === "my_team") {
    return "My team";
  }
  if (filters.scopeType === "all_teams") {
    return "All teams";
  }
  if (filters.scopeType === "team") {
    return teams.find((team) => team.id === filters.scopeValue)?.name ?? "Team";
  }
  if (filters.scopeType === "person") {
    return "Person";
  }
  return "Myself";
}

function recordCategoryLabel(value: CalendarFilterInput["recordTypeCategory"]) {
  if (value === "xero_leave") {
    return "Leave";
  }
  if (value === "local_only") {
    return "Availability";
  }
  return "Leave and availability";
}

function countAppliedFilters(filters: CalendarFilterInput) {
  return [
    filters.approvalStatus?.length,
    filters.includeDrafts,
    filters.locationId?.length,
    filters.personType?.length,
    filters.recordType?.length,
    filters.recordTypeCategory !== "all",
  ].filter(Boolean).length;
}

function rangeUnit(view: CalendarFilterInput["view"]) {
  if (view === "day" || view === "month") {
    return view;
  }
  return "week";
}

function parseView(value: string): CalendarFilterInput["view"] {
  if (value === "day" || value === "month") {
    return value;
  }
  return "week";
}

function parseScopeType(value: string): CalendarFilterInput["scopeType"] {
  if (
    value === "all_teams" ||
    value === "my_team" ||
    value === "person" ||
    value === "team"
  ) {
    return value;
  }
  return "my_self";
}

function parseRecordTypeCategory(
  value: string
): CalendarFilterInput["recordTypeCategory"] {
  if (value === "xero_leave" || value === "local_only") {
    return value;
  }
  return "all";
}

function parseApprovalStatus(
  value: string
): "approved" | "submitted" | "xero_sync_failed" {
  if (value === "submitted" || value === "xero_sync_failed") {
    return value;
  }
  return "approved";
}

function parsePersonType(value: string): "contractor" | "employee" {
  if (value === "contractor") {
    return "contractor";
  }
  return "employee";
}

function FilterSheet({
  appliedFilterCount,
  filters,
  locations,
  setFilterParams,
}: {
  appliedFilterCount: number;
  filters: CalendarFilterInput;
  locations: Option[];
  setFilterParams: (patch: Partial<CalendarFilterInput>) => void;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button type="button" variant="secondary">
          <SlidersHorizontalIcon className="size-4" />
          {appliedFilterCount > 0
            ? `Filters (${appliedFilterCount})`
            : "Filters"}
        </Button>
      </SheetTrigger>
      <SheetContent className="gap-6 p-6">
        <SheetHeader className="p-0">
          <SheetTitle>Refine this calendar</SheetTitle>
          <SheetDescription>
            Choose the people and records that appear in this view.
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-4">
          <FilterSelect
            description="Show leave, manual availability, or both."
            label="Record category"
            onValueChange={(value) =>
              setFilterParams({
                recordTypeCategory: parseRecordTypeCategory(value),
              })
            }
            options={[
              { id: "all", name: "Leave and availability" },
              { id: "xero_leave", name: "Leave" },
              { id: "local_only", name: "Availability" },
            ]}
            value={filters.recordTypeCategory}
          />
          <FilterSelect
            description="Choose one status, or use the calendar's normal status rules."
            label="Approval status"
            onValueChange={(value) =>
              setFilterParams({
                approvalStatus:
                  value === "all" ? undefined : [parseApprovalStatus(value)],
              })
            }
            options={[
              { id: "all", name: "Use calendar defaults" },
              { id: "approved", name: "Approved" },
              { id: "submitted", name: "Pending" },
              { id: "xero_sync_failed", name: "Xero sync failed" },
            ]}
            value={filters.approvalStatus?.[0] ?? "all"}
          />
          <FilterSelect
            description="Limit the view to employees or contractors."
            label="Person type"
            onValueChange={(value) =>
              setFilterParams({
                personType:
                  value === "all" ? undefined : [parsePersonType(value)],
              })
            }
            options={[
              { id: "all", name: "Everyone" },
              { id: "employee", name: "Employees" },
              { id: "contractor", name: "Contractors" },
            ]}
            value={filters.personType?.[0] ?? "all"}
          />
          <FilterSelect
            description="Limit the view to one work location."
            label="Location"
            onValueChange={(value) =>
              setFilterParams({
                locationId: value === "all" ? undefined : [value],
              })
            }
            options={[{ id: "all", name: "All locations" }, ...locations]}
            value={filters.locationId?.[0] ?? "all"}
          />
          <Button
            onClick={() =>
              setFilterParams({
                approvalStatus: undefined,
                includeDrafts: false,
                locationId: undefined,
                personType: undefined,
                recordType: undefined,
                recordTypeCategory: "all",
              })
            }
            type="button"
            variant="ghost"
          >
            Reset calendar filters
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function FilterSelect({
  description,
  label,
  onValueChange,
  options,
  value,
}: {
  description?: string;
  label: string;
  onValueChange: (value: string) => void;
  options: Option[];
  value: string;
}) {
  return (
    <div className="grid gap-2 text-sm">
      <span className="font-medium text-muted-foreground text-xs">{label}</span>
      {description ? (
        <span className="text-muted-foreground text-xs">{description}</span>
      ) : null}
      <Select onValueChange={onValueChange} value={value}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

interface ActiveFilterLabel {
  label: string;
  value: string;
}

function periodLabel(data: CalendarRange): string {
  const formatter = new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  if (data.view === "day") {
    return formatter.format(data.days[0]?.date ?? data.range.start);
  }
  if (data.view === "month") {
    return new Intl.DateTimeFormat("en-AU", {
      month: "long",
      year: "numeric",
    }).format(
      data.days[Math.min(7, data.days.length - 1)]?.date ?? data.range.start
    );
  }
  const first = data.days[0]?.date ?? data.range.start;
  const last = data.days.at(-1)?.date ?? data.range.end;
  return `${formatter.format(first)} to ${formatter.format(last)}`;
}

function dateOnlyInTimeZone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: timezone,
    year: "numeric",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function addDays(dateOnly: string, days: number): string {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addMonths(dateOnly: string, months: number): string {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}
