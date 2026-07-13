"use client";

import { Calendar } from "@repo/design-system/components/ui/calendar";
import { useState } from "react";

export const SingleDate = () => {
  const [date, setDate] = useState<Date | undefined>(new Date(2026, 0, 14));
  return (
    <Calendar
      className="rounded-2xl border"
      defaultMonth={date}
      mode="single"
      onSelect={setDate}
      selected={date}
    />
  );
};

export const DateRange = () => {
  const [range, setRange] = useState<{ from: Date; to?: Date } | undefined>({
    from: new Date(2026, 0, 12),
    to: new Date(2026, 0, 16),
  });
  return (
    <Calendar
      className="rounded-2xl border"
      defaultMonth={range?.from}
      mode="range"
      onSelect={setRange}
      selected={range}
    />
  );
};

export const WithDisabledWeekends = () => {
  const [date, setDate] = useState<Date | undefined>(new Date(2026, 1, 3));
  return (
    <Calendar
      className="rounded-2xl border"
      defaultMonth={date}
      disabled={{ dayOfWeek: [0, 6] }}
      mode="single"
      onSelect={setDate}
      selected={date}
    />
  );
};
