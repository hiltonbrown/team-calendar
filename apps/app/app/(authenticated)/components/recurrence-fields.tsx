"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { cn } from "@repo/design-system/lib/utils";
import {
  createDefaultRecurrenceRule,
  describeRecurrenceRule,
  generateRecurrenceOccurrences,
  parseRecurrenceEndMode,
  parseRecurrenceFrequency,
  parseRecurrenceMonthMode,
  parseRecurrenceUnit,
  type RecurrenceFrequency,
  type RecurrenceMonthMode,
  type RecurrenceRule,
  WEEKDAY_OPTIONS,
} from "../recurrence";

interface RecurrenceFieldsProps {
  endDate: string;
  frequency: RecurrenceFrequency;
  onFrequencyChange: (frequency: RecurrenceFrequency) => void;
  onRuleChange: (rule: RecurrenceRule) => void;
  rule: RecurrenceRule;
  startDate: string;
}

const recurrenceOptions: { label: string; value: RecurrenceFrequency }[] = [
  { value: "none", label: "Does not repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "monthly", label: "Monthly" },
  { value: "annually", label: "Annually" },
  { value: "custom", label: "Custom" },
];

const unitOptions = [
  { value: "day", label: "Days" },
  { value: "week", label: "Weeks" },
  { value: "month", label: "Months" },
  { value: "year", label: "Years" },
];

const monthModeOptions: { label: string; value: RecurrenceMonthMode }[] = [
  { value: "day-of-month", label: "Same day of month" },
  { value: "last-day", label: "Last day of month" },
];

const formatPreviewDate = (date: string) => {
  const parsed = new Date(`${date}T00:00:00`);
  return parsed.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const toPositiveInteger = (value: string) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const RecurrenceFields = ({
  endDate,
  frequency,
  onFrequencyChange,
  onRuleChange,
  rule,
  startDate,
}: RecurrenceFieldsProps) => {
  const preview =
    frequency === "none"
      ? null
      : generateRecurrenceOccurrences(startDate, endDate, rule);

  const handleFrequencyChange = (value: string) => {
    const nextFrequency = parseRecurrenceFrequency(value);
    if (!nextFrequency) {
      return;
    }

    onFrequencyChange(nextFrequency);

    if (nextFrequency !== "none") {
      onRuleChange(createDefaultRecurrenceRule(nextFrequency, startDate));
    }
  };

  const handleWeekdayToggle = (weekday: RecurrenceRule["weekdays"][number]) => {
    const weekdays = rule.weekdays.includes(weekday)
      ? rule.weekdays.filter((day) => day !== weekday)
      : [...rule.weekdays, weekday];

    onRuleChange({ ...rule, weekdays });
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-muted/40 p-4">
      <div className="flex flex-col gap-2">
        <Label
          className="font-bold text-label-sm text-muted-foreground uppercase tracking-widest"
          htmlFor="recurrence-frequency"
        >
          Repeat
        </Label>
        <Select onValueChange={handleFrequencyChange} value={frequency}>
          <SelectTrigger
            className="h-11 w-full rounded-xl"
            id="recurrence-frequency"
          >
            <SelectValue placeholder="Does not repeat" />
          </SelectTrigger>
          <SelectContent>
            {recurrenceOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {frequency !== "none" && (
        <div className="flex flex-col gap-4">
          {frequency === "custom" && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-3">
                <div className="flex flex-col gap-2">
                  <Label
                    className="font-bold text-label-sm text-muted-foreground uppercase tracking-widest"
                    htmlFor="recurrence-interval"
                  >
                    Every
                  </Label>
                  <Input
                    id="recurrence-interval"
                    min={1}
                    onChange={(event) =>
                      onRuleChange({
                        ...rule,
                        interval: toPositiveInteger(event.target.value),
                      })
                    }
                    type="number"
                    value={rule.interval}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label
                    className="font-bold text-label-sm text-muted-foreground uppercase tracking-widest"
                    htmlFor="recurrence-unit"
                  >
                    Unit
                  </Label>
                  <Select
                    onValueChange={(value) => {
                      const unit = parseRecurrenceUnit(value);
                      if (unit) {
                        onRuleChange({ ...rule, unit });
                      }
                    }}
                    value={rule.unit}
                  >
                    <SelectTrigger
                      className="h-10 w-full rounded-xl"
                      id="recurrence-unit"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {unitOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {rule.unit === "week" && (
                <div className="flex flex-col gap-2">
                  <Label className="font-bold text-label-sm text-muted-foreground uppercase tracking-widest">
                    Weekdays
                  </Label>
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                    {WEEKDAY_OPTIONS.map((weekday) => {
                      const active = rule.weekdays.includes(weekday.value);
                      return (
                        <button
                          aria-pressed={active}
                          className={cn(
                            "h-9 rounded-lg border px-2 font-bold text-[11px] uppercase tracking-wider transition-colors",
                            active
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background text-muted-foreground hover:bg-accent"
                          )}
                          key={weekday.value}
                          onClick={() => handleWeekdayToggle(weekday.value)}
                          type="button"
                        >
                          {weekday.shortLabel}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {(rule.unit === "month" || rule.unit === "year") && (
                <div className="flex flex-col gap-2">
                  <Label
                    className="font-bold text-label-sm text-muted-foreground uppercase tracking-widest"
                    htmlFor="recurrence-month-mode"
                  >
                    Month mode
                  </Label>
                  <Select
                    onValueChange={(value) => {
                      const monthMode = parseRecurrenceMonthMode(value);
                      if (monthMode) {
                        onRuleChange({ ...rule, monthMode });
                      }
                    }}
                    value={rule.monthMode}
                  >
                    <SelectTrigger
                      className="h-10 w-full rounded-xl"
                      id="recurrence-month-mode"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {monthModeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-3">
            <div className="flex flex-col gap-2">
              <Label
                className="font-bold text-label-sm text-muted-foreground uppercase tracking-widest"
                htmlFor="recurrence-end-mode"
              >
                Ends
              </Label>
              <Select
                onValueChange={(value) => {
                  const endMode = parseRecurrenceEndMode(value);
                  if (endMode) {
                    onRuleChange({ ...rule, endMode });
                  }
                }}
                value={rule.endMode}
              >
                <SelectTrigger
                  className="h-10 w-full rounded-xl"
                  id="recurrence-end-mode"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="count">After count</SelectItem>
                  <SelectItem value="until">On date</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {rule.endMode === "count" ? (
              <div className="flex flex-col gap-2">
                <Label
                  className="font-bold text-label-sm text-muted-foreground uppercase tracking-widest"
                  htmlFor="recurrence-count"
                >
                  Occurrences
                </Label>
                <Input
                  id="recurrence-count"
                  max={50}
                  min={1}
                  onChange={(event) =>
                    onRuleChange({
                      ...rule,
                      occurrenceCount: toPositiveInteger(event.target.value),
                    })
                  }
                  type="number"
                  value={rule.occurrenceCount}
                />
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Label
                  className="font-bold text-label-sm text-muted-foreground uppercase tracking-widest"
                  htmlFor="recurrence-until-date"
                >
                  Repeat until
                </Label>
                <Input
                  id="recurrence-until-date"
                  min={startDate}
                  onChange={(event) =>
                    onRuleChange({ ...rule, untilDate: event.target.value })
                  }
                  type="date"
                  value={rule.untilDate}
                />
              </div>
            )}
          </div>

          <div className="rounded-xl bg-background/70 p-3">
            {preview?.ok ? (
              <div className="flex flex-col gap-2">
                <p className="font-medium text-body-sm text-foreground">
                  {describeRecurrenceRule(rule)} creates{" "}
                  {preview.occurrences.length}{" "}
                  {preview.occurrences.length === 1 ? "entry" : "entries"}.
                </p>
                <p className="text-label-sm text-muted-foreground">
                  Until date limits the occurrence start date.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {preview.occurrences.slice(0, 5).map((occurrence) => (
                    <span
                      className="rounded-sm bg-muted px-2 py-1 font-bold text-[10px] text-muted-foreground uppercase tracking-wider"
                      key={occurrence.startDate}
                    >
                      {formatPreviewDate(occurrence.startDate)}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="font-medium text-body-sm text-destructive">
                {preview?.error ?? "Check the recurrence settings"}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
