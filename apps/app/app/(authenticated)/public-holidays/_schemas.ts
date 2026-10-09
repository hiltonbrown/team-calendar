import { z } from "zod";

const currentYear = new Date().getFullYear();

export const HOLIDAY_YEAR_OPTIONS = [
  currentYear - 1,
  currentYear,
  currentYear + 1,
  currentYear + 2,
];

export const PublicHolidayFilterSchema = z.object({
  includeHidden: z
    .preprocess((value) => value === "true" || value === true, z.boolean())
    .default(false),
  locationId: z.string().uuid().optional(),
  year: z.coerce
    .number()
    .int()
    .min(currentYear - 1)
    .max(currentYear + 2)
    .default(currentYear),
});

export type PublicHolidayFilters = z.infer<typeof PublicHolidayFilterSchema>;
