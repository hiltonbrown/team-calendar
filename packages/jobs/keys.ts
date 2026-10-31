import { DEFAULT_JOB_IDENTITY_GENERATION } from "@repo/core";
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export {
  currentJobIdentityGeneration,
  DEFAULT_JOB_IDENTITY_GENERATION,
} from "@repo/core";

export const keys = () => {
  const env = createEnv({
    // Treat an empty string (e.g. a blank Vercel env var) as unset so the
    // format-constrained optional keys do not fail validation.
    emptyStringAsUndefined: true,
    runtimeEnv: {
      INNGEST_DEV: process.env.INNGEST_DEV,
      INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY,
      INNGEST_SIGNING_KEY: process.env.INNGEST_SIGNING_KEY,
      JOB_IDENTITY_GENERATION: process.env.JOB_IDENTITY_GENERATION,
    },
    server: {
      INNGEST_DEV: z
        .union([z.enum(["0", "1", "false", "true"]), z.string().url()])
        .optional(),
      INNGEST_EVENT_KEY: z.string().min(1).optional(),
      INNGEST_SIGNING_KEY: z.string().startsWith("signkey-").optional(),
      JOB_IDENTITY_GENERATION: z
        .string()
        .min(1)
        .default(DEFAULT_JOB_IDENTITY_GENERATION),
    },
  });

  // In local development the Inngest Dev Server needs neither key, so both may
  // be absent. In a deployed environment they are required together: a
  // half-configured pair would leave jobs unsigned and unable to authenticate.
  // Enforce both-or-neither during env validation so it fails fast at startup
  // rather than on a later import path. Read from process.env (not the
  // validated proxy) so this stays safe on the client, where server variables
  // are not accessible.
  if (typeof window === "undefined") {
    const hasEventKey = Boolean(process.env.INNGEST_EVENT_KEY);
    const hasSigningKey = Boolean(process.env.INNGEST_SIGNING_KEY);
    if (hasEventKey !== hasSigningKey) {
      throw new Error(
        "INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY must both be set or both omitted to run Inngest in a deployed environment."
      );
    }
  }

  return env;
};
