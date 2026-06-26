import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const keys = () => {
  const env = createEnv({
    server: {
      INNGEST_EVENT_KEY: z.string().min(1).optional(),
      INNGEST_SIGNING_KEY: z.string().startsWith("signkey-").optional(),
      INNGEST_DEV: z
        .union([z.enum(["0", "1", "false", "true"]), z.string().url()])
        .optional(),
    },
    runtimeEnv: {
      INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY,
      INNGEST_SIGNING_KEY: process.env.INNGEST_SIGNING_KEY,
      INNGEST_DEV: process.env.INNGEST_DEV,
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
