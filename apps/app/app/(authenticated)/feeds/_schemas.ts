import { z } from "zod";

export const FeedScopeFormSchema = z
  .object({
    scopeType: z.enum(["org", "team", "person", "self", "manager_team"]),
    scopeValue: z.string().uuid().nullable().optional(),
  })
  .superRefine((value, context) => {
    if (
      (value.scopeType === "team" || value.scopeType === "person") &&
      !value.scopeValue
    ) {
      context.addIssue({
        code: "custom",
        message: "Choose a scope value.",
        path: ["scopeValue"],
      });
    }
  });

export const CreateFeedActionSchema = z.object({
  description: z.string().max(500).optional(),
  includesPublicHolidays: z.boolean().default(false),
  name: z.string().trim().min(1).max(120),
  organisationId: z.string().uuid(),
  privacyMode: z.enum(["named", "masked", "private"]),
  scopes: z.array(FeedScopeFormSchema).min(1),
});

export const UpdateFeedActionSchema = z.object({
  feedId: z.string().uuid(),
  organisationId: z.string().uuid(),
  patch: z.object({
    description: z.string().max(500).nullable().optional(),
    includesPublicHolidays: z.boolean().optional(),
    name: z.string().trim().min(1).max(120).optional(),
    privacyMode: z.enum(["named", "masked", "private"]).optional(),
    scopes: z.array(FeedScopeFormSchema).min(1).optional(),
  }),
});

export const FeedCommandActionSchema = z.object({
  feedId: z.string().uuid(),
  organisationId: z.string().uuid(),
});

export const RevokeTokenActionSchema = z.object({
  organisationId: z.string().uuid(),
  tokenId: z.string().uuid(),
});

export const FeedFilterSchema = z.object({
  cursor: z.string().uuid().optional(),
  privacyMode: z
    .preprocess(arrayFromParam, z.array(z.enum(["named", "masked", "private"])))
    .optional(),
  search: z.string().trim().max(200).optional(),
  status: z
    .preprocess(
      arrayFromParam,
      z.array(z.enum(["active", "paused", "archived"]))
    )
    .default(["active", "paused"]),
});

export type CreateFeedActionInput = z.infer<typeof CreateFeedActionSchema>;
export type UpdateFeedActionInput = z.infer<typeof UpdateFeedActionSchema>;
export type FeedCommandActionInput = z.infer<typeof FeedCommandActionSchema>;
export type RevokeTokenActionInput = z.infer<typeof RevokeTokenActionSchema>;

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
