import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const bootstrapInputSchema = z
  .object({
    countryCode: z.literal("AU"),
    invitationId: z.uuid().optional(),
    timeZone: z
      .string()
      .min(1)
      .max(100)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat("en-AU", {
            timeZone: value,
          }).resolvedOptions();
          return true;
        } catch {
          return false;
        }
      }, "Use a valid timezone"),
  })
  .strict();
export const bootstrapProofSchema = bootstrapInputSchema.extend({
  email: z.email().optional(),
  expiresAt: z.number().int().positive(),
  version: z.literal(1),
});
export type AccountBootstrap = z.infer<typeof bootstrapProofSchema>;
export const bootstrapMaxAge = 1800;
export const bootstrapCookieName = (origin: string) =>
  new URL(origin).protocol === "https:"
    ? "__Secure-team-calendar-auth.signup_context"
    : "team-calendar-dev-auth.signup_context";

export function sealBootstrap(value: AccountBootstrap, secret: string): string {
  const body = Buffer.from(
    JSON.stringify(bootstrapProofSchema.parse(value))
  ).toString("base64url");
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}
export function openBootstrap(
  token: string,
  secret: string,
  now = Date.now()
): AccountBootstrap {
  if (token.length > 2048) {
    throw new Error("Invalid account setup context");
  }
  const pieces = token.split(".");
  if (pieces.length !== 2) {
    throw new Error("Invalid account setup context");
  }
  const [body, signature] = pieces;
  const expected = createHmac("sha256", secret).update(body).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(expected, actual)) {
    throw new Error("Invalid account setup context");
  }
  const value = bootstrapProofSchema.parse(
    JSON.parse(Buffer.from(body, "base64url").toString("utf8"))
  );
  if (
    value.expiresAt <= now ||
    value.expiresAt > now + bootstrapMaxAge * 1000
  ) {
    throw new Error("Account setup context expired");
  }
  return value;
}
export function bootstrapFromCookie(
  headers: Headers,
  origin: string,
  secret: string
): AccountBootstrap {
  const name = bootstrapCookieName(origin);
  const values = (headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`));
  if (values.length !== 1) {
    throw new Error("Start account setup again");
  }
  return openBootstrap(values[0].slice(name.length + 1), secret);
}
