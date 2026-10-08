const SCOPE_SEPARATOR = /\s+/;

import type { Result } from "@repo/core";
import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from "jose";
import { z } from "zod";
import { keys } from "../../keys";

export const XERO_IDENTITY_ISSUER = "https://identity.xero.com";
export const XERO_IDENTITY_AUDIENCE = "https://identity.xero.com/resources";
const remoteJwks = createRemoteJWKSet(
  new URL("https://identity.xero.com/.well-known/openid-configuration/jwks"),
  { cooldownDuration: 30_000, timeoutDuration: 5000 }
);
const claimsSchema = z.object({
  aud: z
    .union([z.string(), z.array(z.string())])
    .refine((aud) =>
      typeof aud === "string"
        ? aud === XERO_IDENTITY_AUDIENCE
        : aud.includes(XERO_IDENTITY_AUDIENCE)
    ),
  authentication_event_id: z.string().min(1).optional(),
  client_id: z.string().min(1),
  exp: z.number().int().nonnegative(),
  iss: z.literal(XERO_IDENTITY_ISSUER),
  nbf: z.number().int().nonnegative().optional(),
  scope: z.union([z.string(), z.array(z.string())]).optional(),
  xero_userid: z.string().trim().min(1),
});
export interface XeroIdentityError {
  code: "identity_verification_failed";
  message: string;
}
export interface XeroAccessTokenIdentity {
  authEventId: string | null;
  expiresAt: Date;
  grantedScopes: string[];
  scopeProvided?: boolean;
  xeroUserId: string;
}
interface IdentityDependencies {
  jwks?: JWTVerifyGetKey;
  now?: () => Date;
}
const failed = (): Result<never, XeroIdentityError> => ({
  error: {
    code: "identity_verification_failed",
    message: "Connecting Xero failed. Start again.",
  },
  ok: false,
});

async function verifyIdentity(
  accessToken: string,
  deps?: IdentityDependencies
): Promise<
  Result<XeroAccessTokenIdentity & { expired: boolean }, XeroIdentityError>
> {
  try {
    const now = (deps?.now ?? (() => new Date()))();
    if (!Number.isFinite(now.getTime())) {
      return failed();
    }
    const jwks = deps?.jwks ?? remoteJwks;
    const { payload } = await jwtVerify(accessToken, jwks, {
      algorithms: ["RS256"],
      audience: XERO_IDENTITY_AUDIENCE,
      currentDate: now,
      issuer: XERO_IDENTITY_ISSUER,
      requiredClaims: ["exp", "client_id", "xero_userid"],
    });
    const claims = claimsSchema.safeParse(payload);
    if (
      !claims.success ||
      claims.data.client_id !== keys().XERO_CLIENT_ID ||
      (claims.data.nbf !== undefined && claims.data.nbf > now.getTime() / 1000)
    ) {
      return failed();
    }
    const expiresAt = new Date(claims.data.exp * 1000);
    if (!Number.isFinite(expiresAt.getTime())) {
      return failed();
    }
    const expired = expiresAt.getTime() <= now.getTime();
    if (expired) {
      return failed();
    }
    return {
      ok: true,
      value: {
        authEventId: claims.data.authentication_event_id ?? null,
        ...(claims.data.scope === undefined ? {} : { scopeProvided: true }),
        expired,
        expiresAt,
        grantedScopes:
          typeof claims.data.scope === "string"
            ? claims.data.scope.split(SCOPE_SEPARATOR).filter(Boolean)
            : (claims.data.scope ?? []),
        xeroUserId: claims.data.xero_userid,
      },
    };
  } catch {
    return failed();
  }
}

export async function verifyXeroAccessTokenIdentity(
  accessToken: string,
  deps?: IdentityDependencies
): Promise<Result<XeroAccessTokenIdentity, XeroIdentityError>> {
  const result = await verifyIdentity(accessToken, deps);
  if (!result.ok) {
    return result;
  }
  const { expired: _expired, ...identity } = result.value;
  return { ok: true, value: identity };
}
