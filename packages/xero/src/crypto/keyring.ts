import type { Result } from "@repo/core";
import { keys } from "../../keys";

export function activeXeroKeyVersion(): number {
  return Number(keys().XERO_TOKEN_ENCRYPTION_ACTIVE_VERSION ?? "1");
}

export function resolveXeroEncryptionKey(
  version: number
): Result<Buffer, { code: "unknown_key_version" }> {
  const env = keys();
  const raw =
    version === 1
      ? env.XERO_TOKEN_ENCRYPTION_KEY
      : env.XERO_TOKEN_ENCRYPTION_KEYS_JSON?.[String(version)];
  return raw
    ? { ok: true, value: Buffer.from(raw, "base64") }
    : { error: { code: "unknown_key_version" }, ok: false };
}
