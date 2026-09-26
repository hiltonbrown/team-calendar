import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

const POSITIVE_VERSION_REGEX = /^[1-9]\d*$/;
const BASE64_REGEX = /^[a-zA-Z0-9+/]*={0,2}$/;

export function validateEncryptionKey(key: string | undefined): void {
  if (!key) {
    throw new Error(
      "XERO_TOKEN_ENCRYPTION_KEY is required but was not found in the environment."
    );
  }
  if (!BASE64_REGEX.test(key)) {
    throw new Error(
      "XERO_TOKEN_ENCRYPTION_KEY is malformed: must be a valid base64-encoded string."
    );
  }
  const buf = Buffer.from(key, "base64");
  if (buf.length !== 32) {
    throw new Error(
      `XERO_TOKEN_ENCRYPTION_KEY is malformed: must decode to exactly 32 bytes (decoded length was ${buf.length} bytes).`
    );
  }
}

// Provide a fallback key in test environments to keep unrelated tests happy
if (process.env.NODE_ENV === "test" && !process.env.XERO_TOKEN_ENCRYPTION_KEY) {
  process.env.XERO_TOKEN_ENCRYPTION_KEY =
    "dGhpcyBpcyBhIDMyLWJ5dGUga2V5IGZvciB4ZXJvITE=";
}

if (process.env.NODE_ENV === "test" && !process.env.XERO_CLIENT_SECRET) {
  process.env.XERO_CLIENT_SECRET = "test-xero-client-secret";
}

export const keys = () =>
  createEnv({
    createFinalSchema: (shape) =>
      z.object(shape).superRefine((env, ctx) => {
        const ring = env.XERO_TOKEN_ENCRYPTION_KEYS_JSON ?? {};
        if (ring["1"] && ring["1"] !== env.XERO_TOKEN_ENCRYPTION_KEY) {
          ctx.addIssue({
            code: "custom",
            message:
              "XERO_TOKEN_ENCRYPTION_KEYS_JSON conflicts with XERO_TOKEN_ENCRYPTION_KEY for version 1",
            path: ["XERO_TOKEN_ENCRYPTION_KEYS_JSON"],
          });
        }
        const active = env.XERO_TOKEN_ENCRYPTION_ACTIVE_VERSION ?? "1";
        if (active !== "1" && !ring[active]) {
          ctx.addIssue({
            code: "custom",
            message:
              "XERO_TOKEN_ENCRYPTION_ACTIVE_VERSION must resolve in XERO_TOKEN_ENCRYPTION_KEYS_JSON",
            path: ["XERO_TOKEN_ENCRYPTION_ACTIVE_VERSION"],
          });
        }
      }),
    // Treat an empty string (e.g. a blank Vercel env var) as unset so the
    // format-constrained optional keys do not fail validation.
    emptyStringAsUndefined: true,
    runtimeEnv: {
      XERO_API_BASE_URL: process.env.XERO_API_BASE_URL,
      XERO_CLIENT_ID: process.env.XERO_CLIENT_ID,
      XERO_CLIENT_SECRET: process.env.XERO_CLIENT_SECRET,
      XERO_REDIRECT_URI: process.env.XERO_REDIRECT_URI,
      XERO_TOKEN_ENCRYPTION_ACTIVE_VERSION:
        process.env.XERO_TOKEN_ENCRYPTION_ACTIVE_VERSION,
      XERO_TOKEN_ENCRYPTION_KEY: process.env.XERO_TOKEN_ENCRYPTION_KEY,
      XERO_TOKEN_ENCRYPTION_KEYS_JSON:
        process.env.XERO_TOKEN_ENCRYPTION_KEYS_JSON,
    },
    server: {
      XERO_API_BASE_URL: z.string().url().optional(),
      XERO_CLIENT_ID: z.string().optional(),
      XERO_CLIENT_SECRET: z.string().optional(),
      // The OAuth redirect URI Xero returns the authorisation code to. It must
      // exactly match a URI pre-registered on the Xero app. When set it pins
      // the callback to the registered production URL regardless of the
      // per-deployment public URLs.
      XERO_REDIRECT_URI: z.string().url().optional(),
      XERO_TOKEN_ENCRYPTION_ACTIVE_VERSION: z
        .string()
        .regex(
          POSITIVE_VERSION_REGEX,
          "XERO_TOKEN_ENCRYPTION_ACTIVE_VERSION must be a positive integer"
        )
        .refine(
          (value) => Number.isSafeInteger(Number(value)),
          "XERO_TOKEN_ENCRYPTION_ACTIVE_VERSION must be a safe integer"
        )
        .optional(),
      XERO_TOKEN_ENCRYPTION_KEY: z.string().refine(
        (val) => {
          try {
            validateEncryptionKey(val);
            return true;
          } catch {
            return false;
          }
        },
        {
          message:
            "XERO_TOKEN_ENCRYPTION_KEY must be a valid 32-byte base64-encoded string",
        }
      ),
      XERO_TOKEN_ENCRYPTION_KEYS_JSON: z
        .string()
        .transform((value, ctx) => {
          try {
            const parsed: unknown = JSON.parse(value);
            const result = z
              .record(
                z
                  .string()
                  .regex(POSITIVE_VERSION_REGEX)
                  .refine((version) => Number.isSafeInteger(Number(version))),
                z.string().refine((key) => {
                  try {
                    validateEncryptionKey(key);
                    return true;
                  } catch {
                    return false;
                  }
                })
              )
              .safeParse(parsed);
            if (result.success) {
              return result.data;
            }
          } catch {
            /* Report only the variable name, never its supplied value. */
          }
          ctx.addIssue({
            code: "custom",
            message:
              "XERO_TOKEN_ENCRYPTION_KEYS_JSON must map positive integer versions to valid 32-byte base64 keys",
          });
          return z.NEVER;
        })
        .optional(),
    },
  });

// Validate immediately on module load to prevent boot if invalid or missing
if (process.env.NODE_ENV !== "test") {
  keys();
}
