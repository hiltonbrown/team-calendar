import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const keys = () =>
  createEnv({
    server: {
      INNGEST_EVENT_KEY: z.string().min(1).optional(),
      INNGEST_SIGNING_KEY: z.string().startsWith("signkey-").optional(),
    },
    runtimeEnv: {
      INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY,
      INNGEST_SIGNING_KEY: process.env.INNGEST_SIGNING_KEY,
    },
  });
