"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { Switch } from "@repo/design-system/components/ui/switch";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { publicHolidayLabel } from "@/components/calendar/public-holiday-label";
import { setLocalHolidayEnabledAction } from "../../public-holidays/_actions";
import { SettingsSectionHeader } from "../components/settings-section-header";

export interface UpcomingHoliday {
  /** YYYY-MM-DD. */
  date: string;
  key: string;
  name: string;
  startsAt: string | null;
}

export interface LocalHolidayGroup {
  holidays: Array<{
    area: string | null;
    date: string;
    enabled: boolean;
    key: string;
    name: string;
  }>;
  locationId: string;
  locationName: string;
}

interface HolidaysClientProps {
  /** YYYY-MM-DD, the last date covered by the summary. */
  coverageEnd: string;
  localGroups: LocalHolidayGroup[];
  organisationId: string;
  summary: {
    customCount: number;
    officialCount: number;
    upcoming: UpcomingHoliday[];
  };
}

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00.000Z`).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  });
}

export const HolidaysClient = ({
  coverageEnd,
  localGroups,
  organisationId,
  summary,
}: HolidaysClientProps) => (
  <div className="space-y-6">
    <SettingsSectionHeader
      description="Official public holidays apply automatically for each location's state or region. Switch on local days here, then open Public Holidays to add company days or change how a holiday applies."
      title="Holidays"
    />

    <div className="flex flex-col gap-4 rounded-2xl bg-muted p-5 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-body-sm">
        <span className="font-semibold text-body-lg tabular-nums">
          {summary.officialCount}
        </span>{" "}
        official and{" "}
        <span className="font-semibold text-body-lg tabular-nums">
          {summary.customCount}
        </span>{" "}
        custom holidays apply between today and {formatDate(coverageEnd)}.
      </p>
      <Button asChild>
        <Link href={`/public-holidays?org=${organisationId}`}>
          Manage public holidays
        </Link>
      </Button>
    </div>

    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Local holidays</CardTitle>
        <CardDescription>
          Local days, such as show days and regional anniversaries, are off
          until you switch them on for a location.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {localGroups.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">
            Add locations to switch on local days for the people based there.
          </p>
        ) : (
          localGroups.map((group) => (
            <LocalHolidayLocation
              group={group}
              key={group.locationId}
              organisationId={organisationId}
            />
          ))
        )}
      </CardContent>
    </Card>

    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Upcoming holidays</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {summary.upcoming.length > 0 ? (
          summary.upcoming.map((holiday) => (
            <div
              className="rounded-xl bg-muted/30 p-3 text-label-lg"
              key={holiday.key}
            >
              {publicHolidayLabel(holiday)} · {formatDate(holiday.date)}
            </div>
          ))
        ) : (
          <p className="text-body-sm text-muted-foreground">
            No upcoming holidays apply. Official holidays for later years are
            added each September.
          </p>
        )}
      </CardContent>
    </Card>
  </div>
);

function LocalHolidayLocation({
  group,
  organisationId,
}: {
  group: LocalHolidayGroup;
  organisationId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const toggle = (holidayKey: string, enabled: boolean) => {
    startTransition(async () => {
      const result = await setLocalHolidayEnabledAction({
        enabled,
        holidayKey,
        locationId: group.locationId,
        organisationId,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(result.value.message);
      router.refresh();
    });
  };

  return (
    <section className="space-y-2">
      <h3 className="font-semibold text-title-sm">{group.locationName}</h3>
      {group.holidays.length === 0 ? (
        <p className="text-body-sm text-muted-foreground">
          No local days are listed for this location&apos;s region.
        </p>
      ) : (
        <ul className="space-y-2">
          {group.holidays.map((holiday) => {
            const id = `local-${group.locationId}-${holiday.key}`;
            return (
              <li
                className="flex items-center justify-between gap-4 rounded-xl bg-muted/30 p-3"
                key={holiday.key}
              >
                <label className="text-label-lg" htmlFor={id}>
                  {holiday.name}
                  {holiday.area ? ` (${holiday.area})` : ""} ·{" "}
                  {formatDate(holiday.date)}
                </label>
                <Switch
                  checked={holiday.enabled}
                  disabled={isPending}
                  id={id}
                  onCheckedChange={(checked) => toggle(holiday.key, checked)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
