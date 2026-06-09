import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const keys = () => {
  const env = createEnv({
    server: {
      KV_REST_API_URL: z.string().url().optional(),
      KV_REST_API_TOKEN: z.string().min(1).optional(),
    },
    runtimeEnv: {
      KV_REST_API_URL: process.env.KV_REST_API_URL,
      KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN,
    },
  });

  // Caching is optional, but a partially configured pair is a
  // misconfiguration. Enforce both-or-neither during env validation so it
  // fails fast at startup rather than on the first cache call. Read from
  // process.env (not the validated proxy) so this stays safe on the client,
  // where server variables are not accessible.
  if (typeof window === "undefined") {
    const hasUrl = Boolean(process.env.KV_REST_API_URL);
    const hasToken = Boolean(process.env.KV_REST_API_TOKEN);
    if (hasUrl !== hasToken) {
      throw new Error(
        "KV_REST_API_URL and KV_REST_API_TOKEN must both be set or both omitted to configure feed caching."
      );
    }
  }

  return env;
};
