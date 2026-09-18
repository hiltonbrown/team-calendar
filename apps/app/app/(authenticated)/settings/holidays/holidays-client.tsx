"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import Link from "next/link";
import { SettingsSectionHeader } from "../components/settings-section-header";

interface HolidayRow {
  archived_at: Date | null;
  country_code: string;
  holiday_date: Date;
  name: string;
  source: "manual" | "nager";
}

interface HolidaysClientProps {
  holidays: HolidayRow[];
  organisationId: string;
}

export const HolidaysClient = ({
  holidays,
  organisationId,
}: HolidaysClientProps) => {
  const importedCount = holidays.filter(
    (holiday) => holiday.source === "nager"
  ).length;
  const customCount = holidays.filter(
    (holiday) => holiday.source === "manual"
  ).length;
  const upcoming = holidays
    .filter((holiday) => holiday.holiday_date >= new Date())
    .slice(0, 12);

  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        description="Review holiday coverage here, then open Public Holidays to refresh sources, add custom dates, or suppress calendar publication."
        title="Holidays"
      />

      <div className="flex flex-col gap-4 rounded-2xl bg-muted p-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm">
          <span className="font-semibold text-lg tabular-nums">
            {importedCount}
          </span>{" "}
          imported and{" "}
          <span className="font-semibold text-lg tabular-nums">
            {customCount}
          </span>{" "}
          custom holidays are recorded for this organisation.
        </p>
        <Button asChild>
          <Link href={`/public-holidays?org=${organisationId}`}>
            Manage public holidays
          </Link>
        </Button>
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Upcoming holidays</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {upcoming.length > 0 ? (
            upcoming.map((holiday) => (
              <div
                className="rounded-xl bg-muted/30 p-3 text-sm"
                key={holiday.name + holiday.holiday_date.toISOString()}
              >
                {holiday.name} · {holiday.country_code} ·{" "}
                {holiday.holiday_date.toLocaleDateString("en-AU")}
              </div>
            ))
          ) : (
            <p className="text-muted-foreground text-sm">
              No upcoming holidays are recorded. Open Public Holidays to refresh
              the source or add a custom date.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
