import { createHash } from "node:crypto";

// Inputs are a 32-byte random OAuth nonce or an HMAC-signed state token, never a
// user password, so a fast lookup hash is the intended primitive.
export function hashOAuthSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
