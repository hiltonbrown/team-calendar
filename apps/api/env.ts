import { keys as analytics } from "@repo/analytics/keys";
import { keys as auth } from "@repo/auth/keys";
import { keys as billing } from "@repo/billing/keys";
import { keys as database } from "@repo/database/keys";
import { keys as email } from "@repo/email/keys";
import { keys as feeds } from "@repo/feeds/keys";
import { keys as jobs } from "@repo/jobs/keys";
import { keys as core } from "@repo/next-config/keys";
import { keys as observability } from "@repo/observability/keys";
import { keys as xero } from "@repo/xero/keys";
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";
import { keys as github } from "./lib/github/keys";

export const env = createEnv({
  client: {},
  // A blank Vercel env var must behave as unset, otherwise the format
  // constraint rejects it even though the variable is optional.
  emptyStringAsUndefined: true,
  extends: [
    auth(),
    billing(),
    analytics(),
    core(),
    database(),
    email(),
    feeds(),
    github(),
    jobs(),
    observability(),
    xero(),
  ],
  runtimeEnv: {
    EARLY_ACCESS_APPLICATION_HMAC_SECRET:
      process.env.EARLY_ACCESS_APPLICATION_HMAC_SECRET,
    EARLY_ACCESS_APPLICATION_RECIPIENT:
      process.env.EARLY_ACCESS_APPLICATION_RECIPIENT,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  },
  server: {
    EARLY_ACCESS_APPLICATION_HMAC_SECRET: z.string().min(32).optional(),
    EARLY_ACCESS_APPLICATION_RECIPIENT: z.string().email().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_").optional(),
  },
});
