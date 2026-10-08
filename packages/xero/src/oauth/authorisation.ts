import {
  listDueXeroAuthorisations,
  saveXeroAuthorisation,
} from "@repo/database/queries/xero-authorisation";

const SCOPE_SEPARATOR = /\s+/;

import "server-only";
import type { Result } from "@repo/core";
import {
  database,
  lockXeroAuthorisation,
  withXeroGrantLock,
} from "@repo/database";
import type {
  Prisma,
  XeroAuthorisation,
  XeroConnection,
} from "@repo/database/generated/client";
import type { XeroProviderConnectionCapture } from "@repo/database/queries/xero-connections";
import { getScopedXeroConnection } from "@repo/database/queries/xero-connections";
import { keys } from "../../keys";
import {
  decryptXeroToken,
  encryptXeroToken,
  tryDecryptXeroToken,
} from "../crypto/tokens";
import type { XeroDeadline } from "../rate-limit/deadline";
import {
  verifyXeroAccessTokenIdentity,
  type XeroAccessTokenIdentity,
} from "./identity";
import { hasXeroCapability } from "./scopes";
import type { XeroOAuthError } from "./service";
import { exchangeToken } from "./token";

export const TOKEN_REFRESH_BUFFER_MS = 2 * 60 * 1000;
// Demand-driven access is primary. Xero expires unused refresh tokens at 60 days;
// 45 days since successful issuance leaves 15 days for maintenance interruptions.
// https://developer.xero.com/faq/oauth2 (reviewed 2026-10-08)
const DORMANT_REFRESH_MS = 45 * 24 * 60 * 60 * 1000;

function tokenDeadline(deadline: XeroDeadline): XeroDeadline {
  return { expiresAtMs: Math.min(deadline.expiresAtMs, Date.now() + 10_000) };
}

export function authorisationAccessToken(grant: XeroAuthorisation): string {
  return decryptXeroToken({
    authTag: grant.access_token_auth_tag,
    encrypted: grant.access_token_encrypted,
    iv: grant.access_token_iv,
    keyVersion: grant.token_key_version,
  });
}
function encryptedTokens(accessToken: string, refreshToken: string) {
  const access = encryptXeroToken(accessToken);
  const refresh = encryptXeroToken(refreshToken);
  return {
    access_token_auth_tag: access.authTag,
    access_token_encrypted: access.encrypted,
    access_token_iv: access.iv,
    refresh_token_auth_tag: refresh.authTag,
    refresh_token_encrypted: refresh.encrypted,
    refresh_token_iv: refresh.iv,
    token_encrypted_at: access.encryptedAt,
    token_key_version: access.keyVersion,
  };
}
export async function adoptXeroAuthorisation(
  input: {
    accessToken: string;
    refreshToken: string;
    scopes?: string;
    identity?: XeroAccessTokenIdentity;
  },
  tx: Prisma.TransactionClient
): Promise<Result<XeroAuthorisation, XeroOAuthError>> {
  const verified = input.identity
    ? { ok: true as const, value: input.identity }
    : await verifyXeroAccessTokenIdentity(input.accessToken);
  if (!verified.ok) {
    return {
      error: {
        code: "invalid_token_response",
        message: verified.error.message,
      },
      ok: false,
    };
  }
  const providerAppId = keys().XERO_CLIENT_ID;
  if (!providerAppId) {
    return {
      error: {
        code: "oauth_not_configured",
        message: "Connecting Xero is unavailable. Contact support.",
      },
      ok: false,
    };
  }
  await lockXeroAuthorisation(tx, providerAppId, verified.value.xeroUserId);
  const data = {
    ...encryptedTokens(input.accessToken, input.refreshToken),
    access_token_expires_at: verified.value.expiresAt,
    granted_scopes:
      input.scopes?.split(SCOPE_SEPARATOR).filter(Boolean) ??
      verified.value.grantedScopes,
    last_refresh_error_at: null,
    last_refresh_error_code: null,
    last_refreshed_at: new Date(),
    status: "active" as const,
  };
  const identity = {
    provider_app_id: providerAppId,
    xero_user_id: verified.value.xeroUserId,
  };
  const authorisation = await saveXeroAuthorisation(
    { ...identity, ...data },
    tx
  );
  return { ok: true, value: authorisation };
}
interface XeroRefreshInput {
  authorisationId: string;
  deadline: XeroDeadline;
  now?: Date;
  onRefreshed?: () => void;
  previousAccessToken?: string;
  reason?: "expiry" | "401" | "dormant";
}
function needsRotation(
  current: XeroAuthorisation,
  input: XeroRefreshInput
): boolean {
  const tokenChanged =
    input.previousAccessToken !== undefined &&
    authorisationAccessToken(current) !== input.previousAccessToken;
  if (input.reason === "dormant") {
    return (
      current.last_refreshed_at.getTime() <=
      (input.now ?? new Date()).getTime() - DORMANT_REFRESH_MS
    );
  }
  return (
    (input.reason === "401" && !tokenChanged) ||
    current.access_token_expires_at.getTime() <=
      Date.now() + TOKEN_REFRESH_BUFFER_MS
  );
}
export async function refreshXeroAuthorisation(
  input: XeroRefreshInput
): Promise<Result<XeroAuthorisation, XeroOAuthError>> {
  const deadline = tokenDeadline(input.deadline);
  try {
    const initial = await database.xeroAuthorisation.findUnique({
      where: { id: input.authorisationId },
    });
    if (!initial) {
      return {
        error: { code: "connection_inactive", message: "Reconnect Xero." },
        ok: false,
      };
    }
    return await withXeroGrantLock(
      {
        deadlineAt: deadline.expiresAtMs,
        mode: "refresh",
        providerAppId: initial.provider_app_id,
        xeroUserId: initial.xero_user_id,
      },
      async (tx) => {
        const current = await tx.xeroAuthorisation.findUniqueOrThrow({
          where: { id: initial.id },
        });
        if (current.status !== "active") {
          return {
            error: {
              code: "refresh_token_invalid",
              message: "Reconnect Xero.",
            },
            ok: false,
          };
        }
        if (
          input.reason === "dormant" &&
          !(await tx.xeroConnection.findFirst({
            select: { id: true },
            where: {
              disconnected_at: null,
              organisation: { archived_at: null, is_active: true },
              status: "active",
              xero_authorisation_id: current.id,
            },
          }))
        ) {
          return { ok: true, value: current };
        }
        if (!needsRotation(current, input)) {
          return { ok: true, value: current };
        }
        const refreshToken = decryptXeroToken({
          authTag: current.refresh_token_auth_tag,
          encrypted: current.refresh_token_encrypted,
          iv: current.refresh_token_iv,
          keyVersion: current.token_key_version,
        });
        const requestedAt = Date.now();
        const rotated = await exchangeToken({
          deadline,
          grantType: "refresh_token",
          rateClass: { kind: "token", providerAppId: current.provider_app_id },
          refreshToken,
        });
        if (!rotated.ok) {
          await tx.xeroAuthorisation.update({
            data: {
              last_refresh_error_at: new Date(),
              last_refresh_error_code: rotated.error.code,
              ...(rotated.error.code === "refresh_token_invalid"
                ? { status: "reconnect_required" }
                : {}),
            },
            where: { id: current.id },
          });
          return rotated;
        }
        // The authenticated token endpoint rotates this already-verified grant.
        // Save its validated response directly; a second JWKS request must not
        // discard the new refresh token. Initial adoption still verifies identity.
        const updated = await tx.xeroAuthorisation.update({
          data: {
            ...encryptedTokens(
              rotated.value.access_token,
              rotated.value.refresh_token
            ),
            access_token_expires_at: new Date(
              requestedAt + rotated.value.expires_in * 1000
            ),
            granted_scopes:
              rotated.value.scope?.split(SCOPE_SEPARATOR).filter(Boolean) ??
              current.granted_scopes,
            last_refresh_error_at: null,
            last_refresh_error_code: null,
            last_refreshed_at: new Date(),
          },
          where: { id: current.id },
        });
        input.onRefreshed?.();
        return { ok: true, value: updated };
      }
    );
  } catch {
    return {
      error: {
        code: "unknown_error",
        message: "Xero is temporarily unavailable. Try again.",
      },
      ok: false,
    };
  }
}
export interface XeroAccessError {
  code: string;
  message: string;
  retryAfterMs?: number;
}
function captureProviderConnection(
  connection: Pick<
    XeroConnection,
    "last_connected_at" | "remote_connection_id"
  >,
  authorisation: XeroAuthorisation
): XeroProviderConnectionCapture | undefined {
  if (!connection.remote_connection_id) {
    return undefined;
  }
  return Object.freeze({
    authorisationId: authorisation.id,
    authorisationUpdatedAt: authorisation.updated_at,
    lastConnectedAt: connection.last_connected_at,
    remoteConnectionId: connection.remote_connection_id,
  });
}

export async function resolveXeroAccess(input: {
  clerkOrgId: string;
  organisationId: string;
  connectionId?: string;
  deadline?: XeroDeadline;
  capability?: string | readonly string[];
  previousAccessToken?: string;
}): Promise<
  Result<
    {
      accessToken: string;
      providerConnection?: XeroProviderConnectionCapture;
      connectionId: string;
      xeroTenantId: string;
      payrollRegion: "AU" | "NZ" | "UK";
      deadline: XeroDeadline;
    },
    XeroAccessError
  >
> {
  const deadline = input.deadline ?? { expiresAtMs: Date.now() + 120_000 };
  const scoped = await getScopedXeroConnection(input);
  if (!scoped.ok) {
    return scoped;
  }
  const connection = scoped.value;
  if (connection.status === "disconnected" || !connection.authorisation) {
    return {
      error: { code: "disconnected", message: "Reconnect Xero." },
      ok: false,
    };
  }
  if (
    connection.status !== "active" ||
    connection.authorisation.status !== "active"
  ) {
    return {
      error: { code: "reauthorisation_required", message: "Reconnect Xero." },
      ok: false,
    };
  }
  const required = input.capability ?? [];
  if (!hasXeroCapability(connection.authorisation.granted_scopes, required)) {
    return {
      error: {
        code: "capability_missing",
        message: "Update Xero permissions.",
      },
      ok: false,
    };
  }
  const initialToken =
    input.previousAccessToken === undefined
      ? { ok: true as const, token: undefined }
      : tryDecryptXeroToken({
          authTag: connection.authorisation.access_token_auth_tag,
          encrypted: connection.authorisation.access_token_encrypted,
          iv: connection.authorisation.access_token_iv,
          keyVersion: connection.authorisation.token_key_version,
        });
  if (!initialToken.ok) {
    return {
      error: {
        code: "decryption_failed",
        message: "Xero credentials could not be read.",
      },
      ok: false,
    };
  }
  const rejectedCurrentToken =
    input.previousAccessToken !== undefined &&
    initialToken.token === input.previousAccessToken;
  const needsRefresh =
    rejectedCurrentToken ||
    connection.authorisation.access_token_expires_at.getTime() <=
      Date.now() + TOKEN_REFRESH_BUFFER_MS;
  const grant = needsRefresh
    ? await refreshXeroAuthorisation({
        authorisationId: connection.authorisation.id,
        deadline,
        previousAccessToken: input.previousAccessToken,
        reason: input.previousAccessToken ? "401" : "expiry",
      })
    : { ok: true as const, value: connection.authorisation };
  if (!grant.ok) {
    return grant;
  }
  const current = await getScopedXeroConnection(input);
  if (
    !current.ok ||
    current.value.id !== connection.id ||
    current.value.status !== "active" ||
    current.value.authorisation?.status !== "active" ||
    current.value.authorisation.access_token_expires_at.getTime() <=
      Date.now() + TOKEN_REFRESH_BUFFER_MS ||
    current.value.xero_authorisation_id !== grant.value.id ||
    current.value.xero_tenant_id !== connection.xero_tenant_id ||
    current.value.payroll_region !== connection.payroll_region
  ) {
    return {
      error: {
        code: "connection_changed",
        message: "The Xero connection changed. Try again.",
      },
      ok: false,
    };
  }
  if (
    !hasXeroCapability(current.value.authorisation.granted_scopes, required)
  ) {
    return {
      error: {
        code: "capability_missing",
        message: "Update Xero permissions.",
      },
      ok: false,
    };
  }
  // A sibling execution may have rotated this shared grant during resolution.
  // Return the credential and capture from the same final canonical snapshot.
  const currentGrant = current.value.authorisation;
  const currentToken = tryDecryptXeroToken({
    authTag: currentGrant.access_token_auth_tag,
    encrypted: currentGrant.access_token_encrypted,
    iv: currentGrant.access_token_iv,
    keyVersion: currentGrant.token_key_version,
  });
  if (!currentToken.ok) {
    return {
      error: {
        code: "decryption_failed",
        message: "Xero credentials could not be read.",
      },
      ok: false,
    };
  }
  return {
    ok: true,
    value: Object.freeze({
      accessToken: currentToken.token,
      connectionId: connection.id,
      deadline,
      payrollRegion: connection.payroll_region,
      providerConnection: captureProviderConnection(
        current.value,
        currentGrant
      ),
      xeroTenantId: connection.xero_tenant_id,
    }),
  };
}

// Internal scheduled maintenance. Customer actions cannot supply a grant ID.
export async function refreshDormantXeroAuthorisations(
  now = new Date()
): Promise<
  Result<{
    scanned: number;
    refreshed: number;
    failed: number;
    skipped: number;
  }>
> {
  const due = await listDueXeroAuthorisations(now);
  if (!due.ok) {
    return due;
  }
  const counts = {
    failed: 0,
    refreshed: 0,
    scanned: due.value.length,
    skipped: 0,
  };
  for (const grant of due.value) {
    let refreshed = false;
    const result = await refreshXeroAuthorisation({
      authorisationId: grant.id,
      deadline: { expiresAtMs: Date.now() + 10_000 },
      now,
      onRefreshed: () => {
        refreshed = true;
      },
      reason: "dormant",
    });
    if (!result.ok) {
      counts.failed += 1;
    } else if (refreshed) {
      counts.refreshed += 1;
    } else {
      counts.skipped += 1;
    }
  }
  return { ok: true, value: counts };
}
