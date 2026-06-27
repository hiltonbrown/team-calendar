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
  server: { STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_").optional() },
  client: {},
  runtimeEnv: { STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET },
});
