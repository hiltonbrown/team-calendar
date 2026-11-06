import { z } from "zod";
import { statement } from "./permissions";

export const permissionRequestSchema = z
  .record(z.string().max(80), z.array(z.string().max(80)).min(1).max(20))
  .superRefine((value, context) => {
    if (Object.keys(value).length === 0 || Object.keys(value).length > 20) {
      context.addIssue({
        code: "custom",
        message: "Invalid permission request",
      });
    }
    for (const [resource, actions] of Object.entries(value)) {
      if (!Object.hasOwn(statement, resource)) {
        context.addIssue({ code: "custom", message: "Unknown permission" });
        continue;
      }
      // The own-key check narrows the keys available in our static statements.
      const known = statement[resource as keyof typeof statement];
      if (
        actions.some((action) => !(known as readonly string[]).includes(action))
      ) {
        context.addIssue({ code: "custom", message: "Unknown permission" });
      }
    }
  });

export const authContextSchema = z
  .object({
    allowed: z.boolean().optional(),
    expiresAt: z.iso.datetime(),
    session: z
      .object({
        accountId: z.uuid().nullable(),
        role: z.enum(["owner", "admin", "manager", "viewer"]).nullable(),
        sessionId: z.uuid(),
        userId: z.uuid(),
      })
      .strict(),
    user: z
      .object({
        email: z.email().nullable(),
        emailVerified: z.boolean(),
        id: z.uuid(),
        image: z.string().nullable(),
        name: z.string().nullable(),
      })
      .strict(),
  })
  .strict();

export type AuthContext = z.infer<typeof authContextSchema>;
