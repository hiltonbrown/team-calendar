import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

const ENCRYPTION_KEY_PATTERN = /^[0-9a-fA-F]{64}$/;

export const keys = () =>
  createEnv({
    server: {
      XERO_API_BASE_URL: z.string().url().optional(),
      XERO_CLIENT_ID: z.string().optional(),
      XERO_CLIENT_SECRET: z.string().optional(),
      XERO_TOKEN_ENCRYPTION_KEY: z
        .string()
        .regex(ENCRYPTION_KEY_PATTERN)
        .optional(),
    },
    runtimeEnv: {
      XERO_API_BASE_URL: process.env.XERO_API_BASE_URL,
      XERO_CLIENT_ID: process.env.XERO_CLIENT_ID,
      XERO_CLIENT_SECRET: process.env.XERO_CLIENT_SECRET,
      XERO_TOKEN_ENCRYPTION_KEY: process.env.XERO_TOKEN_ENCRYPTION_KEY,
    },
  });
