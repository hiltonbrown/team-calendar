import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

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

export const keys = () =>
  createEnv({
    server: {
      XERO_API_BASE_URL: z.string().url().optional(),
      XERO_CLIENT_ID: z.string().optional(),
      XERO_CLIENT_SECRET: z.string().optional(),
      // The OAuth redirect URI Xero returns the authorisation code to. It must
      // exactly match a URI pre-registered on the Xero app. When set it pins
      // the callback to the registered production URL regardless of the
      // per-deployment public URLs.
      XERO_REDIRECT_URI: z.string().url().optional(),
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
    },
    runtimeEnv: {
      XERO_API_BASE_URL: process.env.XERO_API_BASE_URL,
      XERO_CLIENT_ID: process.env.XERO_CLIENT_ID,
      XERO_CLIENT_SECRET: process.env.XERO_CLIENT_SECRET,
      XERO_REDIRECT_URI: process.env.XERO_REDIRECT_URI,
      XERO_TOKEN_ENCRYPTION_KEY: process.env.XERO_TOKEN_ENCRYPTION_KEY,
    },
  });

// Validate immediately on module load to prevent boot if invalid or missing
if (process.env.NODE_ENV !== "test") {
  keys();
}
