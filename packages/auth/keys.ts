import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";
import { getAuthOrigins } from "./cookie-transport";

export const authProviderSchema = z.enum(["clerk", "better-auth"]);
export const authContextModeSchema = z.enum(["local", "remote"]);

export const validateBetterAuthPreviewOrigins = (
  envVars: Record<string, string | undefined>
): void => {
  if (envVars.VERCEL_ENV === "preview") {
    getAuthOrigins(envVars);
  }
};

const infraEnabledSchema = z
  .enum(["false", "true"])
  .default("false")
  .transform((value) => value === "true");

const authOriginSchema = z
  .string()
  .url()
  .superRefine((value, context) => {
    if (!URL.canParse(value)) {
      context.addIssue({
        code: "custom",
        message:
          "must be an exact HTTPS app origin (HTTP localhost is allowed)",
      });
      return;
    }
    const url = new URL(value);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/" ||
      !(
        url.protocol === "https:" ||
        (url.protocol === "http:" && url.hostname === "localhost")
      )
    ) {
      context.addIssue({
        code: "custom",
        message:
          "must be an exact HTTPS app origin (HTTP localhost is allowed)",
      });
    }
  });

export const betterAuthServerEnvironmentSchema = z
  .object({
    AUTH_CONTEXT_MODE: z.literal("local").default("local"),
    BETTER_AUTH_API_KEY: z.string().min(1).optional(),
    BETTER_AUTH_INFRA_ENABLED: infraEnabledSchema,
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_TELEMETRY: z.literal("0").default("0"),
    BETTER_AUTH_URL: authOriginSchema,
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    MICROSOFT_CLIENT_ID: z.string().min(1),
    MICROSOFT_CLIENT_SECRET: z.string().min(1),
    MICROSOFT_TENANT_ID: z.literal("organizations").default("organizations"),
    NEXT_PUBLIC_API_URL: authOriginSchema.optional(),
    NEXT_PUBLIC_APP_URL: authOriginSchema,
    TC_API_CANDIDATE_URL: authOriginSchema.optional(),
    TC_APP_CANDIDATE_URL: authOriginSchema.optional(),
    VERCEL_ENV: z.enum(["development", "preview", "production"]).optional(),
    XERO_AUTH_CLIENT_ID: z.string().min(1),
    XERO_AUTH_CLIENT_SECRET: z.string().min(1),
    XERO_CLIENT_ID: z.string().optional(),
    XERO_CLIENT_SECRET: z.string().optional(),
  })
  .superRefine((values, context) => {
    try {
      validateBetterAuthPreviewOrigins({
        NEXT_PUBLIC_API_URL: values.NEXT_PUBLIC_API_URL,
        NEXT_PUBLIC_APP_URL: values.NEXT_PUBLIC_APP_URL,
        TC_API_CANDIDATE_URL: values.TC_API_CANDIDATE_URL,
        TC_APP_CANDIDATE_URL: values.TC_APP_CANDIDATE_URL,
        VERCEL_ENV: values.VERCEL_ENV,
      });
    } catch {
      context.addIssue({
        code: "custom",
        message:
          "Preview auth requires an exact app/API candidate pair matching NEXT_PUBLIC_APP_URL and NEXT_PUBLIC_API_URL",
        path: ["TC_APP_CANDIDATE_URL", "TC_API_CANDIDATE_URL"],
      });
    }
    if (
      URL.canParse(values.BETTER_AUTH_URL) &&
      URL.canParse(values.NEXT_PUBLIC_APP_URL) &&
      new URL(values.BETTER_AUTH_URL).origin !==
        new URL(values.NEXT_PUBLIC_APP_URL).origin
    ) {
      context.addIssue({
        code: "custom",
        message: "must match NEXT_PUBLIC_APP_URL",
        path: ["BETTER_AUTH_URL"],
      });
    }
    if (values.BETTER_AUTH_INFRA_ENABLED && !values.BETTER_AUTH_API_KEY) {
      context.addIssue({
        code: "custom",
        message: "is required when BETTER_AUTH_INFRA_ENABLED is true",
        path: ["BETTER_AUTH_API_KEY"],
      });
    }
    const payrollCredentials = [
      values.XERO_CLIENT_ID,
      values.XERO_CLIENT_SECRET,
    ];
    for (const name of [
      "XERO_AUTH_CLIENT_ID",
      "XERO_AUTH_CLIENT_SECRET",
    ] as const) {
      if (payrollCredentials.includes(values[name])) {
        context.addIssue({
          code: "custom",
          message: "must be separate from the Xero payroll credentials",
          path: [name],
        });
      }
    }
  });

export type BetterAuthEnvironment = z.output<
  typeof betterAuthServerEnvironmentSchema
>;

export const parseBetterAuthEnvironment = (
  input: Record<string, string | undefined> = process.env
): BetterAuthEnvironment => {
  const parsed = betterAuthServerEnvironmentSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      `Better Auth configuration is invalid: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".")} ${issue.message}`)
        .join("; ")}`
    );
  }
  return parsed.data;
};

export const keys = () =>
  createEnv({
    client: {
      NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL: z
        .string()
        .startsWith("/")
        .optional(),
      NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL: z
        .string()
        .startsWith("/")
        .optional(),
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z
        .string()
        .startsWith("pk_")
        .optional(),
      NEXT_PUBLIC_CLERK_SIGN_IN_URL: z.string().startsWith("/").optional(),
      NEXT_PUBLIC_CLERK_SIGN_UP_URL: z.string().startsWith("/").optional(),
    },
    // Treat an empty string (e.g. a blank Vercel env var) as unset so the
    // format-constrained optional keys do not fail validation.
    emptyStringAsUndefined: true,
    runtimeEnv: {
      AUTH_CONTEXT_MODE: process.env.AUTH_CONTEXT_MODE,
      AUTH_PROVIDER: process.env.AUTH_PROVIDER,
      BETTER_AUTH_API_KEY: process.env.BETTER_AUTH_API_KEY,
      BETTER_AUTH_INFRA_ENABLED: process.env.BETTER_AUTH_INFRA_ENABLED,
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
      BETTER_AUTH_TELEMETRY: process.env.BETTER_AUTH_TELEMETRY,
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
      CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
      MICROSOFT_CLIENT_ID: process.env.MICROSOFT_CLIENT_ID,
      MICROSOFT_CLIENT_SECRET: process.env.MICROSOFT_CLIENT_SECRET,
      MICROSOFT_TENANT_ID: process.env.MICROSOFT_TENANT_ID,
      NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL:
        process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL,
      NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL:
        process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL,
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
      NEXT_PUBLIC_CLERK_SIGN_IN_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL,
      NEXT_PUBLIC_CLERK_SIGN_UP_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL,
      TC_API_CANDIDATE_URL: process.env.TC_API_CANDIDATE_URL,
      TC_APP_CANDIDATE_URL: process.env.TC_APP_CANDIDATE_URL,
      VERCEL_ENV: process.env.VERCEL_ENV,
      XERO_AUTH_CLIENT_ID: process.env.XERO_AUTH_CLIENT_ID,
      XERO_AUTH_CLIENT_SECRET: process.env.XERO_AUTH_CLIENT_SECRET,
    },
    server: {
      AUTH_CONTEXT_MODE: authContextModeSchema.default("local"),
      AUTH_PROVIDER: authProviderSchema.default("clerk"),
      BETTER_AUTH_API_KEY: z.string().min(1).optional(),
      BETTER_AUTH_INFRA_ENABLED: infraEnabledSchema,
      BETTER_AUTH_SECRET: z.string().min(32).optional(),
      BETTER_AUTH_TELEMETRY: z.literal("0").default("0"),
      BETTER_AUTH_URL: authOriginSchema.optional(),
      CLERK_SECRET_KEY: z.string().startsWith("sk_").optional(),
      GOOGLE_CLIENT_ID: z.string().min(1).optional(),
      GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
      MICROSOFT_CLIENT_ID: z.string().min(1).optional(),
      MICROSOFT_CLIENT_SECRET: z.string().min(1).optional(),
      MICROSOFT_TENANT_ID: z.literal("organizations").default("organizations"),
      TC_API_CANDIDATE_URL: authOriginSchema.optional(),
      TC_APP_CANDIDATE_URL: authOriginSchema.optional(),
      VERCEL_ENV: z.enum(["development", "preview", "production"]).optional(),
      XERO_AUTH_CLIENT_ID: z.string().min(1).optional(),
      XERO_AUTH_CLIENT_SECRET: z.string().min(1).optional(),
    },
  });
