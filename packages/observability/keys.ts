import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

const optionalStatusValue = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional()
);

const betterStackConfigurationSchema = z
  .object({
    BETTERSTACK_API_KEY: optionalStatusValue,
    BETTERSTACK_STATUS_PAGE_ID: optionalStatusValue,
    BETTERSTACK_STATUS_PAGE_URL: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().url().optional()
    ),
  })
  .superRefine((configuration, context) => {
    const values = Object.values(configuration);
    const configuredCount = values.filter(Boolean).length;

    if (configuredCount !== 0 && configuredCount !== 3) {
      context.addIssue({
        code: "custom",
        message:
          "Better Stack status configuration must provide the API key, status page ID, and public status page URL together.",
      });
    }
  });

export type BetterStackConfiguration = z.infer<
  typeof betterStackConfigurationSchema
>;

export const parseBetterStackConfiguration = (
  input: Record<string, string | undefined>,
  environment = process.env.NODE_ENV
): BetterStackConfiguration => {
  const configuration = betterStackConfigurationSchema.parse(input);

  if (
    environment === "production" &&
    configuration.BETTERSTACK_STATUS_PAGE_URL &&
    !configuration.BETTERSTACK_STATUS_PAGE_URL.startsWith("https://")
  ) {
    throw new Error(
      "The Better Stack public status page URL must use HTTPS in production."
    );
  }

  return configuration;
};

export const keys = () => {
  const environment = createEnv({
    client: {
      // Added by Sentry Integration, Vercel Marketplace
      NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
    },
    // Treat an empty string (e.g. a blank Vercel env var) as unset so the
    // format-constrained optional keys do not fail validation.
    emptyStringAsUndefined: true,
    runtimeEnv: {
      BETTERSTACK_API_KEY: process.env.BETTERSTACK_API_KEY,
      BETTERSTACK_STATUS_PAGE_ID: process.env.BETTERSTACK_STATUS_PAGE_ID,
      BETTERSTACK_STATUS_PAGE_URL: process.env.BETTERSTACK_STATUS_PAGE_URL,
      NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
      SENTRY_ORG: process.env.SENTRY_ORG,
      SENTRY_PROJECT: process.env.SENTRY_PROJECT,
    },
    server: {
      BETTERSTACK_API_KEY: z.string().optional(),
      BETTERSTACK_STATUS_PAGE_ID: z.string().optional(),
      BETTERSTACK_STATUS_PAGE_URL: z.string().url().optional(),

      // Added by Sentry Integration, Vercel Marketplace
      SENTRY_ORG: z.string().optional(),
      SENTRY_PROJECT: z.string().optional(),
    },
  });

  if (typeof window === "undefined") {
    parseBetterStackConfiguration(environment);
  }

  return environment;
};
