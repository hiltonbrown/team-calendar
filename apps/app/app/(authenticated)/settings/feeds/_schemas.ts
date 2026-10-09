import { z } from "zod";

export const FEED_TYPE_OPTIONS = [
  { label: "Organisation", value: "org" },
  { label: "Team", value: "team" },
  { label: "Person", value: "person" },
  { label: "Personal", value: "self" },
  { label: "Manager team", value: "manager_team" },
] as const;

export type FeedTypeFilter = (typeof FEED_TYPE_OPTIONS)[number]["value"];

export const FeedOversightFilterSchema = z.object({
  cursor: z.string().uuid().optional(),
  search: z.string().trim().max(200).optional(),
  status: z
    .preprocess(
      arrayFromParam,
      z.array(z.enum(["active", "paused", "archived"]))
    )
    .default(["active", "paused"]),
  type: z
    .preprocess(
      arrayFromParam,
      z.array(z.enum(["org", "team", "person", "self", "manager_team"]))
    )
    .optional(),
});

export type FeedOversightFilters = z.infer<typeof FeedOversightFilterSchema>;

function arrayFromParam(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return value;
}
