import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { keys, validateEncryptionKey } from "../../keys";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

export interface EncryptedToken {
  authTag: string;
  encrypted: string;
  encryptedAt: Date;
  iv: string;
  keyVersion: number;
}

export function encryptXeroToken(value: string): EncryptedToken {
  const key = readKey();
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
    keyVersion: 1,
  };
}

export function decryptXeroToken(input: {
  authTag: null | string;
  encrypted: string;
  iv: null | string;
}): string {
  if (!input.encrypted) {
    return "";
  }
  if (!(input.iv && input.authTag)) {
    throw new Error(
      "Encrypted Xero token is missing its IV or auth tag; refusing to use the stored value. Reconnect Xero to repair this connection."
    );
  }

  const key = readKey();
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
}

function readKey(): Buffer {
  const raw = keys().XERO_TOKEN_ENCRYPTION_KEY;
  validateEncryptionKey(raw);
  if (!raw) {
    throw new Error("XERO_TOKEN_ENCRYPTION_KEY is required.");
  }
  return Buffer.from(raw, "base64");
}
