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
        description="A thin admin wrapper over the public holiday service and public holiday screens."
        title="Holidays"
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Imported holidays</CardTitle>
          </CardHeader>
          <CardContent>{importedCount}</CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Custom holidays</CardTitle>
          </CardHeader>
          <CardContent>{customCount}</CardContent>
        </Card>
      </div>

      <div className="flex gap-3">
        <Button asChild>
          <Link href={`/public-holidays/holidays/new?org=${organisationId}`}>
            Add custom holiday
          </Link>
        </Button>
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle>Upcoming holidays</CardTitle>
            <Button asChild variant="outline">
              <Link href={`/public-holidays?org=${organisationId}`}>
                View all
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {upcoming.map((holiday) => (
            <div
              className="rounded-xl bg-muted/30 p-3 text-sm"
              key={holiday.name + holiday.holiday_date.toISOString()}
            >
              {holiday.name} · {holiday.country_code} ·{" "}
              {holiday.holiday_date.toLocaleDateString("en-AU")}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};
