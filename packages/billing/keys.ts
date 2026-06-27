import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const keys = () =>
  createEnv({
    server: {
      STRIPE_CHECKOUT_CANCEL_URL: z.string().url().optional(),
      STRIPE_CHECKOUT_SUCCESS_URL: z.string().url().optional(),
      STRIPE_PORTAL_RETURN_URL: z.string().url().optional(),
      STRIPE_PRICE_BASIC: z.string().optional(),
      STRIPE_PRICE_PREMIUM: z.string().optional(),
      STRIPE_SECRET_KEY: z.string().startsWith("sk_").optional(),
    },
    runtimeEnv: {
      STRIPE_CHECKOUT_CANCEL_URL: process.env.STRIPE_CHECKOUT_CANCEL_URL,
      STRIPE_CHECKOUT_SUCCESS_URL: process.env.STRIPE_CHECKOUT_SUCCESS_URL,
      STRIPE_PORTAL_RETURN_URL: process.env.STRIPE_PORTAL_RETURN_URL,
      STRIPE_PRICE_BASIC: process.env.STRIPE_PRICE_BASIC,
      STRIPE_PRICE_PREMIUM: process.env.STRIPE_PRICE_PREMIUM,
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    },
  });
