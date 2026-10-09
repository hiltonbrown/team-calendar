import { z } from "zod";

/** A real calendar date such as "2026-10-12". */
const WeekParamSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
    );
  });

/** The dashboard `week` search parameter, or undefined when invalid. */
export function parseDashboardWeekParam(
  value: string | string[] | undefined
): string | undefined {
  const parsed = WeekParamSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
