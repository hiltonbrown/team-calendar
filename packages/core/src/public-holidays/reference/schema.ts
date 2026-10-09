import { z } from "zod";
import { type CountryCode, isRegionCode } from "../../regions";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const ID_PATTERN =
  /^(au|nz|uk)-(national|[a-z]+)-(\d{4}-\d{2}-\d{2})-[a-z0-9-]+$/;

function isRealDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

const EntrySchema = z
  .object({
    area: z.string().trim().min(1).optional(),
    date: z.string().refine(isRealDate, "date must be a real YYYY-MM-DD date"),
    id: z
      .string()
      .regex(ID_PATTERN, "id must match <country>-<region>-<date>-<slug>"),
    kind: z.enum(["public", "part_day", "local"]),
    name: z.string().trim().min(1),
    region: z.string().nullable(),
    startsAt: z
      .string()
      .regex(TIME_PATTERN, "startsAt must be HH:mm")
      .optional(),
  })
  .strict()
  .superRefine((entry, context) => {
    if (entry.kind === "part_day" && entry.startsAt === undefined) {
      context.addIssue({
        code: "custom",
        message: "part_day entries need startsAt",
      });
    }
    if (entry.kind !== "part_day" && entry.startsAt !== undefined) {
      context.addIssue({
        code: "custom",
        message: "only part_day entries may have startsAt",
      });
    }
    if (entry.kind === "local" && entry.area === undefined) {
      context.addIssue({ code: "custom", message: "local entries need area" });
    }
    if (entry.kind !== "local" && entry.area !== undefined) {
      context.addIssue({
        code: "custom",
        message: "only local entries may have area",
      });
    }
  });

export type ReferenceHolidayEntry = z.infer<typeof EntrySchema>;

export function referenceFileSchema(country: CountryCode) {
  return z
    .object({
      country: z.literal(country),
      entries: z.array(EntrySchema),
    })
    .strict()
    .superRefine((file, context) => {
      file.entries.forEach((entry, index) => {
        // The entry schema has already checked the id format.
        const [idCountry = "", idRegion = ""] = entry.id.split("-");
        const dateStart = idCountry.length + idRegion.length + 2;
        const idDate = entry.id.slice(dateStart, dateStart + 10);
        const expectedRegion = entry.region?.toLowerCase() ?? "national";
        if (idCountry !== country.toLowerCase()) {
          context.addIssue({
            code: "custom",
            message: `id country does not match file country ${country}`,
            path: ["entries", index, "id"],
          });
        }
        if (idRegion !== expectedRegion) {
          context.addIssue({
            code: "custom",
            message: `id region does not match region ${entry.region ?? "null"}`,
            path: ["entries", index, "id"],
          });
        }
        if (idDate !== entry.date) {
          context.addIssue({
            code: "custom",
            message: `id date does not match date ${entry.date}`,
            path: ["entries", index, "id"],
          });
        }
        if (entry.region !== null && !isRegionCode(country, entry.region)) {
          context.addIssue({
            code: "custom",
            message: `unknown ${country} region ${entry.region}`,
            path: ["entries", index, "region"],
          });
        }
      });
    });
}
