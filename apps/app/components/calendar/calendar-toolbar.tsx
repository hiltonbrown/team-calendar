"use client";

import type { CalendarPerson, CalendarRange } from "@repo/availability";
import { Button } from "@repo/design-system/components/ui/button";
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
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@repo/design-system/components/ui/sheet";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
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

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-muted p-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <Button
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
        <Select
          onValueChange={(value) =>
            update({ view: value as CalendarFilterInput["view"] })
          }
          value={filters.view}
        >
          <SelectTrigger className="w-32">
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
          Add record
        </Button>
      </div>
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
          scopeType: scopeType as CalendarFilterInput["scopeType"],
          scopeValue: scopeValue || undefined,
        });
      }}
      value={value}
    >
      <SelectTrigger className="w-48">
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

function FilterSheet({
  filters,
  locations,
  setFilterParams,
}: {
  filters: CalendarFilterInput;
  locations: Option[];
  setFilterParams: (patch: Partial<CalendarFilterInput>) => void;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button type="button" variant="secondary">
          <SlidersHorizontalIcon className="size-4" />
          Filters
        </Button>
      </SheetTrigger>
      <SheetContent className="gap-6 p-6">
        <SheetHeader className="p-0">
          <SheetTitle>Calendar filters</SheetTitle>
        </SheetHeader>
        <div className="grid gap-4">
          <FilterSelect
            label="Record category"
            onValueChange={(value) =>
              setFilterParams({
                recordTypeCategory:
                  value as CalendarFilterInput["recordTypeCategory"],
              })
            }
            options={[
              { id: "all", name: "All records" },
              { id: "xero_leave", name: "Leave" },
              { id: "local_only", name: "Availability" },
            ]}
            value={filters.recordTypeCategory}
          />
          <FilterSelect
            label="Approval status"
            onValueChange={(value) =>
              setFilterParams({
                approvalStatus:
                  value === "all" ? undefined : [value as "approved"],
              })
            }
            options={[
              { id: "all", name: "Default statuses" },
              { id: "approved", name: "Approved" },
              { id: "submitted", name: "Pending" },
              { id: "xero_sync_failed", name: "Xero sync failed" },
            ]}
            value={filters.approvalStatus?.[0] ?? "all"}
          />
          <FilterSelect
            label="Person type"
            onValueChange={(value) =>
              setFilterParams({
                personType: value === "all" ? undefined : [value as "employee"],
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
            Clear filters
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function FilterSelect({
  label,
  onValueChange,
  options,
  value,
}: {
  label: string;
  onValueChange: (value: string) => void;
  options: Option[];
  value: string;
}) {
  return (
    <div className="grid gap-2 text-sm">
      <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </span>
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
