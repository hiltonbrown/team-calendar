"use client";

import { DATE_RANGE_PRESET_OPTIONS } from "@repo/availability/src/analytics/date-range-options";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export interface CustomRangeErrors {
  end?: string;
  start?: string;
}

export type AnalyticsPersonType = "all" | "contractor" | "employee";

export const validateCustomRange = (
  start: string,
  end: string
): CustomRangeErrors => {
  const errors: CustomRangeErrors = {};
  if (!start) {
    errors.start = "Choose a start date.";
  }
  if (!end) {
    errors.end = "Choose an end date.";
  } else if (start && end < start) {
    errors.end = "The end date must be on or after the start date.";
  }
  return errors;
};

interface AnalyticsFiltersProps {
  customEnd?: string;
  customStart?: string;
  personType?: AnalyticsPersonType;
  preset: string;
}

export function AnalyticsFilters({
  customEnd,
  customStart,
  personType,
  preset,
}: AnalyticsFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [localPreset, setLocalPreset] = useState(preset);
  const [localStart, setLocalStart] = useState(customStart ?? "");
  const [localEnd, setLocalEnd] = useState(customEnd ?? "");
  const [localPersonType, setLocalPersonType] = useState(personType ?? "all");
  const [errors, setErrors] = useState<CustomRangeErrors>({});

  const apply = () => {
    if (localPreset === "custom") {
      const customErrors = validateCustomRange(localStart, localEnd);
      setErrors(customErrors);
      if (Object.keys(customErrors).length > 0) {
        return;
      }
    } else {
      setErrors({});
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set("preset", localPreset);
    if (personType) {
      params.set("personType", localPersonType);
    }
    if (localPreset === "custom") {
      if (localStart) {
        params.set("from", localStart);
      } else {
        params.delete("from");
      }
      if (localEnd) {
        params.set("to", localEnd);
      } else {
        params.delete("to");
      }
    } else {
      params.delete("from");
      params.delete("to");
    }
    params.delete("cursor");
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-end gap-4 rounded-[20px] bg-muted p-4">
      <div className="flex flex-col gap-1.5">
        <Label
          className="text-muted-foreground text-xs uppercase tracking-widest"
          htmlFor="analytics-period"
        >
          Period
        </Label>
        <Select onValueChange={setLocalPreset} value={localPreset}>
          <SelectTrigger
            className="min-w-48 rounded-xl bg-background"
            id="analytics-period"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DATE_RANGE_PRESET_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {personType ? (
        <div className="flex flex-col gap-1.5">
          <Label
            className="text-muted-foreground text-xs uppercase tracking-widest"
            htmlFor="analytics-person-type"
          >
            People
          </Label>
          <Select
            onValueChange={(value: AnalyticsPersonType) =>
              setLocalPersonType(value)
            }
            value={localPersonType}
          >
            <SelectTrigger
              className="min-w-40 rounded-xl bg-background"
              id="analytics-person-type"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All people</SelectItem>
              <SelectItem value="employee">Employees</SelectItem>
              <SelectItem value="contractor">Contractors</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {localPreset === "custom" ? (
        <>
          <div className="flex flex-col gap-1.5">
            <Label
              className="text-muted-foreground text-xs"
              htmlFor="analytics-from"
            >
              From
            </Label>
            <Input
              aria-describedby={
                errors.start ? "analytics-from-error" : undefined
              }
              aria-invalid={Boolean(errors.start)}
              className="rounded-xl bg-background"
              id="analytics-from"
              onChange={(e) => setLocalStart(e.target.value)}
              type="date"
              value={localStart}
            />
            {errors.start ? (
              <p
                className="text-destructive text-xs"
                id="analytics-from-error"
                role="alert"
              >
                {errors.start}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label
              className="text-muted-foreground text-xs"
              htmlFor="analytics-to"
            >
              To
            </Label>
            <Input
              aria-describedby={errors.end ? "analytics-to-error" : undefined}
              aria-invalid={Boolean(errors.end)}
              className="rounded-xl bg-background"
              id="analytics-to"
              onChange={(e) => setLocalEnd(e.target.value)}
              type="date"
              value={localEnd}
            />
            {errors.end ? (
              <p
                className="text-destructive text-xs"
                id="analytics-to-error"
                role="alert"
              >
                {errors.end}
              </p>
            ) : null}
          </div>
        </>
      ) : null}
      <Button onClick={apply} size="sm" type="button" variant="secondary">
        Apply
      </Button>
    </div>
  );
}
