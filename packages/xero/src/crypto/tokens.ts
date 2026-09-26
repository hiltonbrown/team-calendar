import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { activeXeroKeyVersion, resolveXeroEncryptionKey } from "./keyring";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

export type DecryptXeroTokenResult =
  | { ok: true; token: string }
  | { ok: false; reason: string };

/**
 * Non-throwing form of decryptXeroToken, for call sites that must return a
 * Result rather than throw. A corrupt credential row or a missing encryption
 * key is an expected failure at the Xero boundary, not an exception.
 */
export function tryDecryptXeroToken(input: {
  authTag: null | string;
  encrypted: string;
  iv: null | string;
  keyVersion: number;
}): DecryptXeroTokenResult {
  try {
    return { ok: true, token: decryptXeroToken(input) };
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error ? error.message : "Token decryption failed.",
    };
  }
}

export interface EncryptedToken {
  authTag: string;
  encrypted: string;
  encryptedAt: Date;
  iv: string;
  keyVersion: number;
}

export function encryptXeroToken(value: string): EncryptedToken {
  const keyVersion = activeXeroKeyVersion();
  const key = readKey(keyVersion);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);

  return {
    authTag: cipher.getAuthTag().toString("base64"),
    encrypted: encrypted.toString("base64"),
    encryptedAt: new Date(),
    iv: iv.toString("base64"),
    keyVersion,
  };
}

export function decryptXeroToken(input: {
  authTag: null | string;
  encrypted: string;
  iv: null | string;
  keyVersion: number;
}): string {
  const key = readKey(input.keyVersion);
  if (!input.encrypted) {
    return "";
  }
  if (!(input.iv && input.authTag)) {
    throw new Error(
      "Encrypted Xero token is missing its IV or auth tag; refusing to use the stored value. Reconnect Xero to repair this connection."
    );
  }

  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(input.iv, "base64")
    );
    decipher.setAuthTag(Buffer.from(input.authTag, "base64"));

    return Buffer.concat([
      decipher.update(Buffer.from(input.encrypted, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // biome-ignore lint/style/useErrorCause: Crypto error causes must not expose sensitive internals.
    throw new Error("Encrypted Xero token authentication failed.");
  }
}

function readKey(version: number): Buffer {
  const result = resolveXeroEncryptionKey(version);
  if (!result.ok) {
    throw new Error("Encrypted Xero token has an unknown key version.");
  }
  return result.value;
}
