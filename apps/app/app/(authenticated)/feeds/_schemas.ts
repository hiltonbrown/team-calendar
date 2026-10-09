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

export const CreateOwnFeedActionSchema = z.object({
  kind: z.enum(["personal", "team"]),
  organisationId: z.string().uuid(),
});

export const RevokeTokenActionSchema = z.object({
  organisationId: z.string().uuid(),
  tokenId: z.string().uuid(),
});

export type CreateFeedActionInput = z.infer<typeof CreateFeedActionSchema>;
export type UpdateFeedActionInput = z.infer<typeof UpdateFeedActionSchema>;
export type FeedCommandActionInput = z.infer<typeof FeedCommandActionSchema>;
export type CreateOwnFeedActionInput = z.infer<
  typeof CreateOwnFeedActionSchema
>;
export type RevokeTokenActionInput = z.infer<typeof RevokeTokenActionSchema>;
