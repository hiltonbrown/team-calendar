import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const keys = () =>
  createEnv({
    runtimeEnv: {
      DATABASE_APP_URL: process.env.DATABASE_APP_URL,
      DATABASE_URL: process.env.DATABASE_URL,
    },
    server: {
      DATABASE_APP_URL: z.string().url().optional(),
      DATABASE_URL: z.string().url(),
    },
  });
