import "server-only";

import {
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { ensureDefaultPublicHolidaysForOrganisation } from "@repo/availability";
import type { ClerkOrgId, OrganisationId, Result } from "@repo/core";
import { database } from "@repo/database";
import type { Prisma } from "@repo/database/generated/client";
import { ensureDefaultCalendarFeed } from "@repo/feeds";
import { log } from "@repo/observability/log";
import { z } from "zod";
import { keys } from "../../keys";
import { decryptXeroToken, encryptXeroToken } from "../crypto/tokens";
import { orgRateLimitKey, xeroFetch } from "../rate-limit/xero-fetch";

const XERO_AUTHORISE_URL = "https://login.xero.com/identity/connect/authorize";
const XERO_CONNECTIONS_URL = "https://api.xero.com/connections";
const XERO_ORGANISATION_URL = "https://api.xero.com/api.xro/2.0/Organisation";
const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";
const XERO_SCOPES = [
  "offline_access",
  "accounting.settings.read",
  "payroll.employees",
  "payroll.employees.read",
  "payroll.payruns",
  "payroll.payruns.read",
  "payroll.settings",
  "payroll.settings.read",
].join(" ");
const STATE_MAX_AGE_MS = 10 * 60 * 1000;
const DEFAULT_XERO_RETURN_TO = "/settings/integrations/xero";

interface OAuthStatePayload {
  clerkOrgId: string;
  issuedAt: number;
  nonce: string;
  organisationId: null | string;
  returnTo: string;
  userId: null | string;
}

const TokenResponseSchema = z.object({
  access_token: z.string().trim().min(1),
  expires_in: z.number().finite().int().positive(),
  refresh_token: z.string().trim().min(1),
});

type TokenResponse = z.infer<typeof TokenResponseSchema>;

const OAuthErrorResponseSchema = z.object({
  error: z.string().trim().min(1),
});

interface ConnectionResponse {
  connectionId: string;
  tenantId: string;
  tenantName: string;
}

interface XeroOrganisationResponse {
  Organisations?: Array<{
    CountryCode?: string;
    Name?: string;
    ShortCode?: string;
  }>;
}

export interface PendingXeroSessionOrganisation {
  countryCode: string;
  id: string;
  name: string;
}

export interface PendingXeroSessionTenant {
  connectionId: string;
  tenantId: string;
  tenantName: string;
}

export type XeroOAuthError =
  | { code: "already_refreshed"; message: string }
  | { code: "connect_disabled"; message: string }
  | { code: "client_credentials_invalid"; message: string }
  | { code: "connection_inactive"; message: string }
  | { code: "invalid_country"; message: string }
  | { code: "invalid_organisation_selection"; message: string }
  | { code: "invalid_state"; message: string }
  | { code: "invalid_token_response"; message: string }
  | { code: "network_error"; message: string }
  | { code: "oauth_not_configured"; message: string }
  | { code: "organisation_not_found"; message: string }
  | { code: "refresh_token_invalid"; message: string }
  | { code: "session_not_found"; message: string }
  | { code: "tenant_not_found"; message: string }
  | { code: "unknown_error"; message: string };

interface SuccessfulRefreshAttempt {
  accessToken: ReturnType<typeof encryptXeroToken>;
  expiresAt: Date;
  previousRefreshTokenEncrypted: string;
  refreshedAt: Date;
  refreshToken: ReturnType<typeof encryptXeroToken>;
}

interface RefreshAttemptCallbacks {
  onResponseAccepted?: () => void;
  onSuccess?: (attempt: SuccessfulRefreshAttempt) => void;
  onTokenLoaded?: (refreshTokenEncrypted: string) => void;
}

type RevokeConnectionResult =
  | { ok: true; value: { remoteRevoked: boolean } }
  | { error: XeroOAuthError; httpStatus: null | number; ok: false };

class OrganisationSelectionRaceError extends Error {}

export function buildXeroOAuthStartUrl(input: {
  clerkOrgId: string;
  organisationId?: null | string;
  returnTo?: string;
  userId?: null | string;
}): Result<{ nonce: string; redirectUrl: string }, XeroOAuthError> {
  if (isPreviewDeployment()) {
    return xeroConnectDisabled();
  }

  const clientId = keys().XERO_CLIENT_ID;
  const clientSecret = keys().XERO_CLIENT_SECRET;
  if (!(clientId && clientSecret)) {
    return oauthNotConfigured();
  }

  if (input.returnTo !== undefined && !isLocalApplicationPath(input.returnTo)) {
    return invalidState();
  }

  const url = new URL(XERO_AUTHORISE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", callbackUrl());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", XERO_SCOPES);
  const nonce = randomBytes(32).toString("base64url");
  url.searchParams.set(
    "state",
    signState(
      {
        clerkOrgId: input.clerkOrgId,
        issuedAt: Date.now(),
        nonce,
        organisationId: input.organisationId ?? null,
        returnTo: input.returnTo ?? DEFAULT_XERO_RETURN_TO,
        userId: input.userId ?? null,
      },
      clientSecret
    )
  );

  return { ok: true, value: { nonce, redirectUrl: url.toString() } };
}

export async function completeXeroOAuth(input: {
  code: string;
  nonce: null | string;
  state: string;
}): Promise<Result<{ redirectTo: string; sessionId: string }, XeroOAuthError>> {
  const state = verifyState(input.state);
  if (!state.ok) {
    return state;
  }
  const nonceMatches =
    input.nonce !== null &&
    state.value.nonce.length === input.nonce.length &&
    timingSafeEqual(Buffer.from(state.value.nonce), Buffer.from(input.nonce));
  if (!nonceMatches) {
    return invalidState();
  }

  const returnTo = isLocalApplicationPath(state.value.returnTo)
    ? state.value.returnTo
    : DEFAULT_XERO_RETURN_TO;

  const orgKey = orgRateLimitKey({
    clerkOrgId: state.value.clerkOrgId,
    organisationId: state.value.organisationId,
  });
  const token = await exchangeToken({
    code: input.code,
    grantType: "authorization_code",
    orgKey,
  });
  if (!token.ok) {
    return token;
  }

  const connections = await fetchConnections(token.value.access_token, orgKey);
  if (!connections.ok) {
    return connections;
  }

  const sessionExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
  const tokenExpiresAt = new Date(Date.now() + token.value.expires_in * 1000);
  const encryptedAccessToken = encryptXeroToken(token.value.access_token);
  const encryptedRefreshToken = encryptXeroToken(token.value.refresh_token);

  const session = await database.xeroOAuthSession.create({
    data: {
      access_token_auth_tag: encryptedAccessToken.authTag,
      access_token_encrypted: encryptedAccessToken.encrypted,
      access_token_iv: encryptedAccessToken.iv,
      available_tenants_json: {
        tenants: connections.value.map((tenant) => ({
          connectionId: tenant.connectionId,
          tenantId: tenant.tenantId,
          tenantName: tenant.tenantName,
        })),
      },
      clerk_org_id: state.value.clerkOrgId,
      created_by_user_id: state.value.userId,
      expires_at: sessionExpiresAt,
      organisation_id: state.value.organisationId,
      refresh_token_auth_tag: encryptedRefreshToken.authTag,
      refresh_token_encrypted: encryptedRefreshToken.encrypted,
      refresh_token_iv: encryptedRefreshToken.iv,
      return_to: returnTo,
      status: "pending",
      token_encrypted_at: encryptedAccessToken.encryptedAt,
      token_expires_at: tokenExpiresAt,
      token_key_version: encryptedAccessToken.keyVersion,
    },
    select: { id: true },
  });

  return {
    ok: true,
    value: {
      redirectTo: `/settings/integrations/xero/connect?session=${session.id}`,
      sessionId: session.id,
    },
  };
}

export function isLocalApplicationPath(value: string): boolean {
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return false;
  }

  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint !== undefined &&
      (codePoint <= 31 || (codePoint >= 127 && codePoint <= 159))
    ) {
      return false;
    }
  }

  return true;
}

export async function getPendingXeroOAuthSession(input: {
  clerkOrgId: string;
  sessionId: string;
  userId: string;
}): Promise<
  Result<
    {
      expiresAt: Date;
      organisations: PendingXeroSessionOrganisation[];
      presetOrganisationId: null | string;
      returnTo: string;
      sessionId: string;
      tenants: PendingXeroSessionTenant[];
    },
    XeroOAuthError
  >
> {
  const session = await loadPendingSession(input);
  if (!session.ok) {
    return session;
  }

  const organisations = await database.organisation.findMany({
    orderBy: [{ created_at: "asc" }, { name: "asc" }],
    select: {
      country_code: true,
      id: true,
      name: true,
    },
    where: {
      archived_at: null,
      clerk_org_id: input.clerkOrgId,
    },
  });

  const tenants = readAvailableTenants(session.value.available_tenants_json);
  return {
    ok: true,
    value: {
      expiresAt: session.value.expires_at,
      organisations: organisations.map((organisation) => ({
        countryCode: organisation.country_code,
        id: organisation.id,
        name: organisation.name,
      })),
      presetOrganisationId: session.value.organisation_id,
      returnTo: session.value.return_to,
      sessionId: session.value.id,
      tenants,
    },
  };
}

export async function scrubInactiveXeroOAuthSessionCredentials(
  now: Date = new Date()
): Promise<Result<{ scrubbed: number }, XeroOAuthError>> {
  try {
    const scrubbed = await database.$transaction(async (tx) => {
      const expired = await tx.xeroOAuthSession.updateMany({
        data: {
          access_token_auth_tag: null,
          access_token_encrypted: "",
          access_token_iv: null,
          available_tenants_json: { tenants: [] },
          refresh_token_auth_tag: null,
          refresh_token_encrypted: "",
          refresh_token_iv: null,
          status: "expired",
          token_encrypted_at: null,
        },
        where: {
          expires_at: { lte: now },
          status: "pending",
        },
      });
      const inactive = await tx.xeroOAuthSession.updateMany({
        data: {
          access_token_auth_tag: null,
          access_token_encrypted: "",
          access_token_iv: null,
          available_tenants_json: { tenants: [] },
          refresh_token_auth_tag: null,
          refresh_token_encrypted: "",
          refresh_token_iv: null,
          token_encrypted_at: null,
        },
        where: {
          OR: [
            { access_token_auth_tag: { not: null } },
            { access_token_encrypted: { not: "" } },
            { access_token_iv: { not: null } },
            { refresh_token_auth_tag: { not: null } },
            { refresh_token_encrypted: { not: "" } },
            { refresh_token_iv: { not: null } },
          ],
          status: { in: ["cancelled", "completed", "expired"] },
        },
      });
      return expired.count + inactive.count;
    });
    return { ok: true, value: { scrubbed } };
  } catch {
    return {
      error: {
        code: "unknown_error",
        message: "Failed to clean up inactive Xero OAuth sessions.",
      },
      ok: false,
    };
  }
}

export async function completeXeroTenantSelection(input: {
  clerkOrgId: string;
  organisationId?: null | string;
  sessionId: string;
  tenantId: string;
  userId: string;
}): Promise<
  Result<
    {
      connectionId: string;
      organisationId: string;
      returnTo: string;
      xeroTenantId: string;
    },
    XeroOAuthError
  >
> {
  const sessionResult = await loadPendingSession({
    clerkOrgId: input.clerkOrgId,
    sessionId: input.sessionId,
    userId: input.userId,
  });
  if (!sessionResult.ok) {
    return sessionResult;
  }

  const session = sessionResult.value;
  const selectedTenant = readAvailableTenants(
    session.available_tenants_json
  ).find((tenant) => tenant.tenantId === input.tenantId);
  if (!selectedTenant) {
    return {
      error: {
        code: "tenant_not_found",
        message:
          "The selected Xero tenant was not found in this OAuth session.",
      },
      ok: false,
    };
  }

  const accessToken = decryptXeroToken({
    authTag: session.access_token_auth_tag,
    encrypted: session.access_token_encrypted,
    iv: session.access_token_iv,
  });
  const refreshToken = decryptXeroToken({
    authTag: session.refresh_token_auth_tag,
    encrypted: session.refresh_token_encrypted,
    iv: session.refresh_token_iv,
  });

  const payrollRegionResult = await inferPayrollRegionForTenant({
    accessToken,
    orgKey: orgRateLimitKey({
      clerkOrgId: input.clerkOrgId,
      organisationId: input.organisationId ?? session.organisation_id,
    }),
    tenantId: selectedTenant.tenantId,
  });
  if (!payrollRegionResult.ok) {
    return payrollRegionResult;
  }

  const { payrollRegion } = payrollRegionResult.value;
  if (payrollRegion !== "AU") {
    return {
      error: {
        code: "invalid_country",
        message:
          "Team Calendar currently supports Australian Xero Payroll files only.",
      },
      ok: false,
    };
  }
  const organisation = await resolveOrganisationForTenantSelection({
    clerkOrgId: input.clerkOrgId,
    organisationId: input.organisationId ?? session.organisation_id,
    tenantName: selectedTenant.tenantName,
    tenantPayrollRegion: payrollRegion,
  });
  if (!organisation.ok) {
    return organisation;
  }

  const encryptedAccessToken = encryptXeroToken(accessToken);
  const encryptedRefreshToken = encryptXeroToken(refreshToken);
  const now = new Date();
  let selection:
    | {
        connection: { id: string };
        createdOrganisation: boolean;
        ok: true;
        organisationId: string;
        xeroTenant: { id: string };
      }
    | { ok: false; reason: "session" };
  try {
    selection = await database.$transaction(async (tx) => {
      const claimed = await tx.xeroOAuthSession.updateMany({
        data: { status: "completed" },
        where: {
          clerk_org_id: input.clerkOrgId,
          created_by_user_id: input.userId,
          expires_at: { gt: now },
          id: session.id,
          status: "pending",
        },
      });
      if (claimed.count === 0) {
        return { ok: false as const, reason: "session" as const };
      }

      const selectedOrganisation =
        organisation.value.kind === "create"
          ? await tx.organisation.create({
              data: organisation.value.create,
              select: { id: true },
            })
          : await tx.organisation.findFirst({
              select: { id: true },
              where: {
                archived_at: null,
                clerk_org_id: input.clerkOrgId,
                id: organisation.value.id,
              },
            });
      if (!selectedOrganisation) {
        throw new OrganisationSelectionRaceError();
      }
      const organisationId = selectedOrganisation.id;

      const nextConnection = await tx.xeroConnection.upsert({
        create: {
          access_token_auth_tag: encryptedAccessToken.authTag,
          access_token_encrypted: encryptedAccessToken.encrypted,
          access_token_iv: encryptedAccessToken.iv,
          clerk_org_id: input.clerkOrgId,
          disconnected_at: null,
          disconnected_by_user_id: null,
          expires_at: session.token_expires_at,
          last_connected_at: now,
          last_disconnected_at: null,
          last_error_code: null,
          last_error_message: null,
          last_refreshed_at: now,
          organisation_id: organisationId,
          refresh_token_auth_tag: encryptedRefreshToken.authTag,
          refresh_token_encrypted: encryptedRefreshToken.encrypted,
          refresh_token_iv: encryptedRefreshToken.iv,
          revoked_at: null,
          stale_since: null,
          status: "active",
          token_encrypted_at: encryptedAccessToken.encryptedAt,
          token_key_version: encryptedAccessToken.keyVersion,
          xero_authorisation_connection_id: selectedTenant.connectionId,
        },
        select: { id: true },
        update: {
          access_token_auth_tag: encryptedAccessToken.authTag,
          access_token_encrypted: encryptedAccessToken.encrypted,
          access_token_iv: encryptedAccessToken.iv,
          disconnected_at: null,
          disconnected_by_user_id: null,
          expires_at: session.token_expires_at,
          last_connected_at: now,
          last_disconnected_at: null,
          last_error_code: null,
          last_error_message: null,
          last_refreshed_at: now,
          refresh_token_auth_tag: encryptedRefreshToken.authTag,
          refresh_token_encrypted: encryptedRefreshToken.encrypted,
          refresh_token_iv: encryptedRefreshToken.iv,
          revoked_at: null,
          stale_since: null,
          status: "active",
          token_encrypted_at: encryptedAccessToken.encryptedAt,
          token_key_version: encryptedAccessToken.keyVersion,
          xero_authorisation_connection_id: selectedTenant.connectionId,
        },
        where: { organisation_id: organisationId },
      });

      const nextTenant = await tx.xeroTenant.upsert({
        create: {
          clerk_org_id: input.clerkOrgId,
          organisation_id: organisationId,
          payroll_region: payrollRegion,
          tenant_name: selectedTenant.tenantName,
          xero_connection_id: nextConnection.id,
          xero_tenant_id: selectedTenant.tenantId,
        },
        select: { id: true },
        update: {
          payroll_region: payrollRegion,
          tenant_name: selectedTenant.tenantName,
          xero_tenant_id: selectedTenant.tenantId,
        },
        where: { xero_connection_id: nextConnection.id },
      });

      await tx.xeroOAuthSession.update({
        data: {
          access_token_auth_tag: null,
          access_token_encrypted: "",
          access_token_iv: null,
          available_tenants_json: { tenants: [] },
          organisation_id: organisationId,
          refresh_token_auth_tag: null,
          refresh_token_encrypted: "",
          refresh_token_iv: null,
          selected_payroll_region: payrollRegion,
          selected_tenant_id: selectedTenant.tenantId,
          selected_tenant_name: selectedTenant.tenantName,
          token_encrypted_at: null,
        },
        where: { id: session.id },
      });

      return {
        connection: nextConnection,
        createdOrganisation: organisation.value.kind === "create",
        ok: true as const,
        organisationId,
        xeroTenant: nextTenant,
      };
    });
  } catch (error) {
    if (error instanceof OrganisationSelectionRaceError) {
      return {
        error: {
          code: "organisation_not_found",
          message: "Organisation not found for the selected Xero tenant.",
        },
        ok: false,
      };
    }
    return {
      error: {
        code: "unknown_error",
        message: "Failed to save the selected Xero tenant.",
      },
      ok: false,
    };
  }

  if (!selection.ok) {
    return {
      error: {
        code: "session_not_found",
        message:
          "This Xero OAuth session has already been completed or is no longer available.",
      },
      ok: false,
    };
  }

  if (selection.createdOrganisation) {
    await provisionNewOrganisationDefaults({
      clerkOrgId: input.clerkOrgId,
      organisationId: selection.organisationId,
    });
  }

  return {
    ok: true,
    value: {
      connectionId: selection.connection.id,
      organisationId: selection.organisationId,
      returnTo: session.return_to,
      xeroTenantId: selection.xeroTenant.id,
    },
  };
}

export async function refreshXeroOAuthConnection(input: {
  clerkOrgId: string;
  connectionId: string;
  organisationId: string;
}): Promise<Result<{ refreshedAt: Date }, XeroOAuthError>> {
  let responseAccepted = false;
  let successfulAttempt: SuccessfulRefreshAttempt | null = null;
  let loadedRefreshTokenEncrypted: string | null = null;
  try {
    return await database.$transaction(
      async (tx) => {
        // Same lock key as ensureFreshXeroConnection so a manual refresh cannot
        // race a scheduled refresh and consume each other's single-use tokens.
        await tx.$queryRaw`
          SELECT pg_advisory_xact_lock(hashtextextended(${input.connectionId}, 0))::text AS acquired
        `;
        const refreshed = await refreshXeroOAuthConnectionWithClient(
          tx,
          input,
          {
            onResponseAccepted: () => {
              responseAccepted = true;
            },
            onSuccess: (attempt) => {
              successfulAttempt = attempt;
            },
            onTokenLoaded: (encrypted) => {
              loadedRefreshTokenEncrypted = encrypted;
            },
          }
        );
        if (!refreshed.ok) {
          return refreshed;
        }
        return {
          ok: true,
          value: { refreshedAt: refreshed.value.refreshedAt },
        };
      },
      { timeout: 15_000 }
    );
  } catch {
    if (responseAccepted) {
      const recovery = await reconcileRefreshPersistenceFailure({
        ...input,
        loadedRefreshTokenEncrypted,
        successfulAttempt,
      });
      if (recovery.ok && recovery.value.committed) {
        return {
          ok: true,
          value: { refreshedAt: recovery.value.refreshedAt },
        };
      }
    }
    return {
      error: {
        code: "unknown_error",
        message: "Failed to refresh the Xero connection.",
      },
      ok: false,
    };
  }
}

async function refreshXeroOAuthConnectionWithClient(
  client: Pick<Prisma.TransactionClient, "xeroConnection">,
  input: {
    clerkOrgId: string;
    connectionId: string;
    organisationId: string;
  },
  callbacks: RefreshAttemptCallbacks = {}
): Promise<Result<{ expiresAt: Date; refreshedAt: Date }, XeroOAuthError>> {
  const connection = await client.xeroConnection.findFirst({
    select: {
      disconnected_at: true,
      id: true,
      refresh_token_auth_tag: true,
      refresh_token_encrypted: true,
      refresh_token_iv: true,
      revoked_at: true,
      status: true,
      token_key_version: true,
    },
    where: {
      clerk_org_id: input.clerkOrgId,
      id: input.connectionId,
      organisation_id: input.organisationId,
    },
  });
  if (!connection) {
    return {
      error: {
        code: "organisation_not_found",
        message: "Xero connection not found.",
      },
      ok: false,
    };
  }

  if (
    connection.disconnected_at !== null ||
    connection.revoked_at !== null ||
    connection.status !== "active"
  ) {
    return {
      error: {
        code: "connection_inactive",
        message: "Xero connection is not active; reconnect required.",
      },
      ok: false,
    };
  }

  callbacks.onTokenLoaded?.(connection.refresh_token_encrypted);

  const token = await exchangeToken({
    grantType: "refresh_token",
    onResponseAccepted: callbacks.onResponseAccepted,
    orgKey: orgRateLimitKey({
      clerkOrgId: input.clerkOrgId,
      organisationId: input.organisationId,
    }),
    refreshToken: decryptXeroToken({
      authTag: connection.refresh_token_auth_tag,
      encrypted: connection.refresh_token_encrypted,
      iv: connection.refresh_token_iv,
    }),
  });
  if (!token.ok) {
    if (
      token.error.code === "refresh_token_invalid" ||
      token.error.code === "client_credentials_invalid"
    ) {
      await client.xeroConnection.updateMany({
        data: {
          last_error_code: token.error.code,
          last_error_message: token.error.message,
          stale_since: new Date(),
          status: "stale",
        },
        where: {
          clerk_org_id: input.clerkOrgId,
          disconnected_at: null,
          id: input.connectionId,
          organisation_id: input.organisationId,
          revoked_at: null,
          status: "active",
        },
      });
    } else if (token.error.code === "invalid_token_response") {
      await client.xeroConnection.updateMany({
        data: {
          expires_at: new Date(),
          last_error_code: "refresh_persist_failed",
          last_error_message: token.error.message,
          stale_since: null,
          status: "active",
        },
        where: {
          clerk_org_id: input.clerkOrgId,
          disconnected_at: null,
          id: input.connectionId,
          organisation_id: input.organisationId,
          refresh_token_encrypted: connection.refresh_token_encrypted,
          revoked_at: null,
          status: "active",
        },
      });
    }
    return token;
  }

  const refreshedAt = new Date();
  const encryptedAccessToken = encryptXeroToken(token.value.access_token);
  const encryptedRefreshToken = encryptXeroToken(token.value.refresh_token);
  const expiresAt = new Date(
    refreshedAt.getTime() + token.value.expires_in * 1000
  );
  callbacks.onSuccess?.({
    accessToken: encryptedAccessToken,
    expiresAt,
    previousRefreshTokenEncrypted: connection.refresh_token_encrypted,
    refreshedAt,
    refreshToken: encryptedRefreshToken,
  });

  const persisted = await client.xeroConnection.updateMany({
    data: {
      access_token_auth_tag: encryptedAccessToken.authTag,
      access_token_encrypted: encryptedAccessToken.encrypted,
      access_token_iv: encryptedAccessToken.iv,
      expires_at: expiresAt,
      last_error_code: null,
      last_error_message: null,
      last_refreshed_at: refreshedAt,
      refresh_token_auth_tag: encryptedRefreshToken.authTag,
      refresh_token_encrypted: encryptedRefreshToken.encrypted,
      refresh_token_iv: encryptedRefreshToken.iv,
      stale_since: null,
      status: "active",
      token_encrypted_at: encryptedAccessToken.encryptedAt,
      token_key_version: encryptedAccessToken.keyVersion,
    },
    where: {
      clerk_org_id: input.clerkOrgId,
      disconnected_at: null,
      id: input.connectionId,
      organisation_id: input.organisationId,
      refresh_token_encrypted: connection.refresh_token_encrypted,
      revoked_at: null,
      status: "active",
    },
  });

  if (persisted.count === 0) {
    return {
      error: {
        code: "already_refreshed",
        message:
          "The connection has already been refreshed by a concurrent process.",
      },
      ok: false,
    };
  }

  return { ok: true, value: { expiresAt, refreshedAt } };
}

async function reconcileRefreshPersistenceFailure(input: {
  clerkOrgId: string;
  connectionId: string;
  loadedRefreshTokenEncrypted: null | string;
  organisationId: string;
  successfulAttempt: null | SuccessfulRefreshAttempt;
}): Promise<
  Result<
    { committed: boolean; expiresAt: Date; refreshedAt: Date },
    XeroOAuthError
  >
> {
  try {
    const current = await database.xeroConnection.findFirst({
      select: {
        disconnected_at: true,
        expires_at: true,
        refresh_token_encrypted: true,
        revoked_at: true,
        status: true,
      },
      where: {
        clerk_org_id: input.clerkOrgId,
        id: input.connectionId,
        organisation_id: input.organisationId,
      },
    });
    if (!current) {
      return {
        error: {
          code: "organisation_not_found",
          message: "Xero connection not found.",
        },
        ok: false,
      };
    }

    const tokenChanged =
      input.loadedRefreshTokenEncrypted !== null &&
      current.refresh_token_encrypted !== input.loadedRefreshTokenEncrypted;
    if (tokenChanged) {
      return {
        ok: true,
        value: {
          committed: true,
          expiresAt: current.expires_at,
          refreshedAt: input.successfulAttempt?.refreshedAt ?? new Date(),
        },
      };
    }

    if (
      input.successfulAttempt !== null &&
      current.status === "active" &&
      current.revoked_at === null &&
      current.disconnected_at === null
    ) {
      const recovered = await database.xeroConnection.updateMany({
        data: {
          access_token_auth_tag: input.successfulAttempt.accessToken.authTag,
          access_token_encrypted: input.successfulAttempt.accessToken.encrypted,
          access_token_iv: input.successfulAttempt.accessToken.iv,
          expires_at: input.successfulAttempt.expiresAt,
          last_error_code: null,
          last_error_message: null,
          last_refreshed_at: input.successfulAttempt.refreshedAt,
          refresh_token_auth_tag: input.successfulAttempt.refreshToken.authTag,
          refresh_token_encrypted:
            input.successfulAttempt.refreshToken.encrypted,
          refresh_token_iv: input.successfulAttempt.refreshToken.iv,
          stale_since: null,
          status: "active",
          token_encrypted_at: input.successfulAttempt.accessToken.encryptedAt,
          token_key_version: input.successfulAttempt.accessToken.keyVersion,
        },
        where: {
          clerk_org_id: input.clerkOrgId,
          disconnected_at: null,
          id: input.connectionId,
          organisation_id: input.organisationId,
          refresh_token_encrypted:
            input.successfulAttempt.previousRefreshTokenEncrypted,
          revoked_at: null,
          status: "active",
        },
      });
      if (recovered.count === 1) {
        return {
          ok: true,
          value: {
            committed: true,
            expiresAt: input.successfulAttempt.expiresAt,
            refreshedAt: input.successfulAttempt.refreshedAt,
          },
        };
      }
    }

    if (
      current.status === "active" &&
      current.revoked_at === null &&
      current.disconnected_at === null &&
      input.loadedRefreshTokenEncrypted !== null
    ) {
      await database.xeroConnection.updateMany({
        data: {
          expires_at: new Date(),
          last_error_code: "refresh_persist_failed",
          last_error_message:
            "Xero accepted the token refresh, but Team Calendar could not save the rotated credentials. Automatic recovery will retry shortly.",
          stale_since: null,
          status: "active",
        },
        where: {
          clerk_org_id: input.clerkOrgId,
          disconnected_at: null,
          id: input.connectionId,
          organisation_id: input.organisationId,
          refresh_token_encrypted: input.loadedRefreshTokenEncrypted,
          revoked_at: null,
          status: "active",
        },
      });
    }

    return {
      ok: true,
      value: {
        committed: false,
        expiresAt: current.expires_at,
        refreshedAt: input.successfulAttempt?.refreshedAt ?? new Date(),
      },
    };
  } catch {
    return {
      error: {
        code: "unknown_error",
        message: "Failed to recover the Xero token refresh.",
      },
      ok: false,
    };
  }
}

// Xero access tokens live for 30 minutes. Refresh proactively when the token is within this
// window of expiry so a sync or write never fails on a token that lapsed mid-run.
export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

export type XeroConnectionRefreshDecision = "active" | "refresh" | "inactive";

// Pure decision: given a connection's current token state, should we use it as-is, refresh
// it first, or treat it as unusable? Kept side-effect free so the window logic is unit
// testable without a database or HTTP.
export function xeroConnectionRefreshDecision(
  input: {
    expiresAt: Date;
    hasAccessToken: boolean;
    hasRefreshToken: boolean;
    revokedAt: Date | null;
    status: string | null;
  },
  now: Date
): XeroConnectionRefreshDecision {
  if (
    input.revokedAt !== null ||
    input.status === "disconnected" ||
    input.status === "stale"
  ) {
    return "inactive";
  }
  const expiresWithinBuffer =
    input.expiresAt.getTime() - now.getTime() <= TOKEN_REFRESH_BUFFER_MS;
  // A missing access token cannot be used either, so treat it like an expired one.
  if (input.hasAccessToken && !expiresWithinBuffer) {
    return "active";
  }
  // Token is missing, lapsed, or about to; only a stored refresh token can recover it.
  return input.hasRefreshToken ? "refresh" : "inactive";
}

// Ensure the connection has a usable access token before a background sync or a write,
// refreshing proactively when it is at or near expiry. Returns the resulting expiry and
// whether a refresh occurred so callers can reload the freshly persisted tokens.
export async function ensureFreshXeroConnection(input: {
  clerkOrgId: string;
  connectionId: string;
  forceRefresh?: boolean;
  organisationId: string;
  now?: Date;
  previousAccessTokenEncrypted?: string;
}): Promise<Result<{ expiresAt: Date; refreshed: boolean }, XeroOAuthError>> {
  const now = input.now ?? new Date();
  const connection = await database.xeroConnection.findFirst({
    select: {
      access_token_encrypted: true,
      expires_at: true,
      refresh_token_encrypted: true,
      revoked_at: true,
      status: true,
    },
    where: {
      clerk_org_id: input.clerkOrgId,
      id: input.connectionId,
      organisation_id: input.organisationId,
    },
  });
  if (!connection) {
    return {
      error: {
        code: "organisation_not_found",
        message: "Xero connection not found.",
      },
      ok: false,
    };
  }
  if (
    input.previousAccessTokenEncrypted !== undefined &&
    connection.access_token_encrypted !== input.previousAccessTokenEncrypted
  ) {
    return {
      ok: true,
      value: { expiresAt: connection.expires_at, refreshed: false },
    };
  }

  let decision = xeroConnectionRefreshDecision(
    {
      expiresAt: connection.expires_at,
      hasAccessToken: connection.access_token_encrypted.length > 0,
      hasRefreshToken: connection.refresh_token_encrypted.length > 0,
      revokedAt: connection.revoked_at,
      status: connection.status,
    },
    now
  );
  if (decision === "active" && input.forceRefresh) {
    decision = "refresh";
  }
  if (decision === "inactive") {
    return {
      error: {
        code: "connection_inactive",
        message: "Xero connection is not active; reconnect required.",
      },
      ok: false,
    };
  }
  if (decision === "active") {
    return {
      ok: true,
      value: { expiresAt: connection.expires_at, refreshed: false },
    };
  }

  let responseAccepted = false;
  let successfulAttempt: SuccessfulRefreshAttempt | null = null;
  let loadedRefreshTokenEncrypted: string | null = null;
  try {
    return await database.$transaction(
      async (tx) => {
        // Serialise refreshes for this connection across all instances. The lock is
        // transaction-scoped, so it releases automatically on commit or rollback.
        // Any future token rotation write path must take this same lock key.
        await tx.$queryRaw`
          SELECT pg_advisory_xact_lock(hashtextextended(${input.connectionId}, 0))::text AS acquired
        `;

        // Re-read inside the lock: a concurrent winner may have refreshed already.
        const current = await tx.xeroConnection.findFirst({
          select: {
            access_token_encrypted: true,
            expires_at: true,
            refresh_token_auth_tag: true,
            refresh_token_encrypted: true,
            refresh_token_iv: true,
            revoked_at: true,
            status: true,
            token_key_version: true,
          },
          where: {
            clerk_org_id: input.clerkOrgId,
            id: input.connectionId,
            organisation_id: input.organisationId,
          },
        });
        if (!current) {
          return {
            error: {
              code: "organisation_not_found",
              message: "Xero connection not found.",
            },
            ok: false,
          };
        }
        if (
          input.previousAccessTokenEncrypted !== undefined &&
          current.access_token_encrypted !== input.previousAccessTokenEncrypted
        ) {
          return {
            ok: true,
            value: { expiresAt: current.expires_at, refreshed: false },
          };
        }

        let lockedDecision = xeroConnectionRefreshDecision(
          {
            expiresAt: current.expires_at,
            hasAccessToken: current.access_token_encrypted.length > 0,
            hasRefreshToken: current.refresh_token_encrypted.length > 0,
            revokedAt: current.revoked_at,
            status: current.status,
          },
          now
        );
        if (lockedDecision === "active" && input.forceRefresh) {
          lockedDecision = "refresh";
        }
        if (lockedDecision === "inactive") {
          return {
            error: {
              code: "connection_inactive",
              message: "Xero connection is not active; reconnect required.",
            },
            ok: false,
          };
        }
        if (lockedDecision === "active") {
          return {
            ok: true,
            value: { expiresAt: current.expires_at, refreshed: false },
          };
        }

        const refreshed = await refreshXeroOAuthConnectionWithClient(
          tx,
          {
            clerkOrgId: input.clerkOrgId,
            connectionId: input.connectionId,
            organisationId: input.organisationId,
          },
          {
            onResponseAccepted: () => {
              responseAccepted = true;
            },
            onSuccess: (attempt) => {
              successfulAttempt = attempt;
            },
            onTokenLoaded: (encrypted) => {
              loadedRefreshTokenEncrypted = encrypted;
            },
          }
        );
        if (!refreshed.ok) {
          return refreshed;
        }

        return {
          ok: true,
          value: { expiresAt: refreshed.value.expiresAt, refreshed: true },
        };
      },
      { timeout: 15_000 }
    );
  } catch {
    if (responseAccepted) {
      const recovery = await reconcileRefreshPersistenceFailure({
        ...input,
        loadedRefreshTokenEncrypted,
        successfulAttempt,
      });
      if (recovery.ok && recovery.value.committed) {
        return {
          ok: true,
          value: {
            expiresAt: recovery.value.expiresAt,
            refreshed: true,
          },
        };
      }
    }
    return {
      error: {
        code: "unknown_error",
        message: "Failed to refresh the Xero connection.",
      },
      ok: false,
    };
  }
}

interface DisconnectXeroInput {
  clerkOrgId: string;
  connectionId: string;
  destructive: boolean;
  organisationId: string;
  performedByUserId?: null | string;
}

export async function disconnectXeroOAuthConnection(
  input: DisconnectXeroInput
): Promise<
  Result<{ disconnected: true; remoteRevoked: boolean }, XeroOAuthError>
> {
  try {
    return await database.$transaction(
      (tx) => disconnectXeroOAuthConnectionWithClient(tx, input),
      { timeout: 20_000 }
    );
  } catch {
    return {
      error: {
        code: "unknown_error",
        message: "Failed to disconnect the Xero connection.",
      },
      ok: false,
    };
  }
}

type DisconnectConnection = NonNullable<
  Awaited<ReturnType<typeof loadConnectionForDisconnect>>
>;

async function disconnectXeroOAuthConnectionWithClient(
  tx: Prisma.TransactionClient,
  input: DisconnectXeroInput
): Promise<
  Result<{ disconnected: true; remoteRevoked: boolean }, XeroOAuthError>
> {
  await tx.$queryRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${input.connectionId}, 0))::text AS acquired
  `;
  const connection = await loadConnectionForDisconnect(tx, input);
  if (!connection) {
    return connectionNotFoundError();
  }
  if (connection.status === "disconnected") {
    return {
      ok: true,
      value: { disconnected: true, remoteRevoked: false },
    };
  }

  const now = new Date();
  const prepared = await prepareConnectionForDisconnect(
    tx,
    input,
    connection,
    now
  );
  if (!prepared.ok) {
    return prepared;
  }
  const revoked = await revokePreparedXeroConnection(
    tx,
    input,
    prepared.value.connection,
    prepared.value.terminalAuthorisation,
    now
  );
  if (!revoked.ok) {
    return revoked;
  }

  await finaliseLocalXeroDisconnect(tx, {
    ...input,
    now,
    xeroTenantId: revoked.value.connection.xero_tenant?.id ?? null,
  });
  return {
    ok: true,
    value: {
      disconnected: true,
      remoteRevoked: revoked.value.remoteRevoked,
    },
  };
}

async function prepareConnectionForDisconnect(
  tx: Prisma.TransactionClient,
  input: DisconnectXeroInput,
  connection: DisconnectConnection,
  now: Date
): Promise<
  Result<
    { connection: DisconnectConnection; terminalAuthorisation: boolean },
    XeroOAuthError
  >
> {
  const terminalAuthorisation =
    connection.revoked_at !== null ||
    (connection.status === "stale" &&
      connection.last_error_code === "refresh_token_invalid");
  if (
    !connection.xero_authorisation_connection_id ||
    terminalAuthorisation ||
    xeroConnectionRefreshDecision(
      {
        expiresAt: connection.expires_at,
        hasAccessToken: connection.access_token_encrypted.length > 0,
        hasRefreshToken: connection.refresh_token_encrypted.length > 0,
        revokedAt: connection.revoked_at,
        status: connection.status,
      },
      now
    ) !== "refresh"
  ) {
    return { ok: true, value: { connection, terminalAuthorisation } };
  }
  return await refreshConnectionForDisconnect(tx, input, connection);
}

async function refreshConnectionForDisconnect(
  tx: Prisma.TransactionClient,
  input: DisconnectXeroInput,
  connection: DisconnectConnection
): Promise<
  Result<
    { connection: DisconnectConnection; terminalAuthorisation: boolean },
    XeroOAuthError
  >
> {
  const refreshed = await refreshXeroOAuthConnectionWithClient(tx, input);
  if (!refreshed.ok) {
    if (refreshed.error.code === "refresh_token_invalid") {
      return {
        ok: true,
        value: { connection, terminalAuthorisation: true },
      };
    }
    return refreshed;
  }
  const reloaded = await loadConnectionForDisconnect(tx, input);
  return reloaded
    ? {
        ok: true,
        value: { connection: reloaded, terminalAuthorisation: false },
      }
    : connectionNotFoundError();
}

async function revokePreparedXeroConnection(
  tx: Prisma.TransactionClient,
  input: DisconnectXeroInput,
  connection: DisconnectConnection,
  terminalAuthorisation: boolean,
  now: Date
): Promise<
  Result<
    { connection: DisconnectConnection; remoteRevoked: boolean },
    XeroOAuthError
  >
> {
  if (!connection.xero_authorisation_connection_id || terminalAuthorisation) {
    return { ok: true, value: { connection, remoteRevoked: false } };
  }
  if (!hasUsableAccessTokenForDisconnect(connection, now)) {
    return {
      error: {
        code: "connection_inactive",
        message:
          "Team Calendar could not confirm the Xero connection revocation. Reconnect Xero, then try disconnecting again.",
      },
      ok: false,
    };
  }

  const first = await revokeStoredXeroConnection(input, connection);
  if (first.ok) {
    return {
      ok: true,
      value: { connection, remoteRevoked: first.value.remoteRevoked },
    };
  }
  if (first.httpStatus !== 401) {
    return { error: first.error, ok: false };
  }

  const recovered = await refreshConnectionForDisconnect(tx, input, connection);
  if (!recovered.ok) {
    return recovered;
  }
  if (recovered.value.terminalAuthorisation) {
    return {
      ok: true,
      value: { connection: recovered.value.connection, remoteRevoked: false },
    };
  }
  const second = await revokeStoredXeroConnection(
    input,
    recovered.value.connection
  );
  return second.ok
    ? {
        ok: true,
        value: {
          connection: recovered.value.connection,
          remoteRevoked: second.value.remoteRevoked,
        },
      }
    : { error: second.error, ok: false };
}

function hasUsableAccessTokenForDisconnect(
  connection: DisconnectConnection,
  now: Date
): boolean {
  return (
    connection.revoked_at === null &&
    connection.access_token_encrypted.length > 0 &&
    connection.access_token_auth_tag !== null &&
    connection.access_token_iv !== null &&
    connection.expires_at.getTime() > now.getTime()
  );
}

function revokeStoredXeroConnection(
  input: DisconnectXeroInput,
  connection: DisconnectConnection
): Promise<RevokeConnectionResult> {
  return revokeXeroConnectionAtSource({
    accessToken: decryptXeroToken({
      authTag: connection.access_token_auth_tag,
      encrypted: connection.access_token_encrypted,
      iv: connection.access_token_iv,
    }),
    orgKey: orgRateLimitKey({
      clerkOrgId: input.clerkOrgId,
      organisationId: input.organisationId,
    }),
    xeroAuthorisationConnectionId:
      connection.xero_authorisation_connection_id ?? "",
  });
}

function connectionNotFoundError(): Result<never, XeroOAuthError> {
  return {
    error: {
      code: "organisation_not_found",
      message: "Xero connection not found.",
    },
    ok: false,
  };
}

function loadConnectionForDisconnect(
  tx: Prisma.TransactionClient,
  input: {
    clerkOrgId: string;
    connectionId: string;
    organisationId: string;
  }
) {
  return tx.xeroConnection.findFirst({
    select: {
      access_token_auth_tag: true,
      access_token_encrypted: true,
      access_token_iv: true,
      disconnected_at: true,
      expires_at: true,
      last_error_code: true,
      refresh_token_encrypted: true,
      revoked_at: true,
      status: true,
      xero_authorisation_connection_id: true,
      xero_tenant: { select: { id: true } },
    },
    where: {
      clerk_org_id: input.clerkOrgId,
      id: input.connectionId,
      organisation_id: input.organisationId,
    },
  });
}

async function finaliseLocalXeroDisconnect(
  tx: Prisma.TransactionClient,
  input: {
    clerkOrgId: string;
    connectionId: string;
    destructive: boolean;
    now: Date;
    organisationId: string;
    performedByUserId?: null | string;
    xeroTenantId: null | string;
  }
): Promise<void> {
  await tx.xeroConnection.update({
    data: {
      access_token_auth_tag: null,
      access_token_encrypted: "",
      access_token_iv: null,
      disconnected_at: input.now,
      disconnected_by_user_id: input.performedByUserId ?? null,
      expires_at: input.now,
      last_disconnected_at: input.now,
      refresh_token_auth_tag: null,
      refresh_token_encrypted: "",
      refresh_token_iv: null,
      status: "disconnected",
    },
    where: {
      clerk_org_id: input.clerkOrgId,
      id: input.connectionId,
      organisation_id: input.organisationId,
    },
  });

  if (!input.destructive) {
    return;
  }
  await tx.leaveBalance.deleteMany({
    where: {
      clerk_org_id: input.clerkOrgId,
      organisation_id: input.organisationId,
    },
  });
  await tx.xeroPersonMatch.deleteMany({
    where: {
      clerk_org_id: input.clerkOrgId,
      organisation_id: input.organisationId,
    },
  });
  await tx.person.updateMany({
    data: { archived_at: input.now, clerk_user_id: null },
    where: {
      clerk_org_id: input.clerkOrgId,
      organisation_id: input.organisationId,
      source_system: "XERO",
    },
  });
  await tx.person.updateMany({
    data: { xero_employee_id: null },
    where: {
      clerk_org_id: input.clerkOrgId,
      organisation_id: input.organisationId,
    },
  });
  await tx.availabilityRecord.updateMany({
    data: { archived_at: input.now, publish_status: "archived" },
    where: {
      clerk_org_id: input.clerkOrgId,
      organisation_id: input.organisationId,
      source_type: { in: ["xero", "xero_leave"] },
    },
  });
  if (!input.xeroTenantId) {
    return;
  }
  await tx.syncRun.deleteMany({
    where: {
      clerk_org_id: input.clerkOrgId,
      organisation_id: input.organisationId,
      xero_tenant_id: input.xeroTenantId,
    },
  });
  await tx.xeroSyncCursor.deleteMany({
    where: {
      clerk_org_id: input.clerkOrgId,
      organisation_id: input.organisationId,
      xero_tenant_id: input.xeroTenantId,
    },
  });
}

async function revokeXeroConnectionAtSource(input: {
  accessToken: string;
  orgKey: string;
  xeroAuthorisationConnectionId: string;
}): Promise<RevokeConnectionResult> {
  try {
    const response = await xeroFetch({
      init: {
        headers: { Authorization: `Bearer ${input.accessToken}` },
        method: "DELETE",
      },
      maxAttempts: 1,
      orgKey: input.orgKey,
      url: `${XERO_CONNECTIONS_URL}/${input.xeroAuthorisationConnectionId}`,
    });
    if (response.ok) {
      return { ok: true, value: { remoteRevoked: true } };
    }
    if (response.status === 404) {
      return { ok: true, value: { remoteRevoked: false } };
    }
    return {
      error: {
        code:
          response.status === 401 || response.status === 403
            ? "connection_inactive"
            : "network_error",
        message:
          response.status === 401 || response.status === 403
            ? "Xero rejected the connection revocation. Reconnect Xero, then try disconnecting again."
            : "Xero could not confirm the connection revocation. Try again.",
      },
      httpStatus: response.status,
      ok: false,
    };
  } catch {
    return {
      error: {
        code: "network_error",
        message: "Xero could not confirm the connection revocation. Try again.",
      },
      httpStatus: null,
      ok: false,
    };
  }
}

export async function markXeroConnectionStale(input: {
  clerkOrgId: string;
  connectionId: string;
  errorCode: string;
  errorMessage: string;
  organisationId: string;
}): Promise<void> {
  await database.xeroConnection.updateMany({
    data: {
      last_error_code: input.errorCode,
      last_error_message: input.errorMessage,
      stale_since: new Date(),
      status: "stale",
    },
    where: {
      clerk_org_id: input.clerkOrgId,
      disconnected_at: null,
      id: input.connectionId,
      organisation_id: input.organisationId,
      revoked_at: null,
      status: "active",
    },
  });
}

async function resolveOrganisationForTenantSelection(input: {
  clerkOrgId: string;
  organisationId: null | string;
  tenantName: string;
  tenantPayrollRegion: "AU" | "NZ" | "UK";
}): Promise<
  Result<
    | {
        create: {
          clerk_org_id: string;
          country_code: string;
          locale: string;
          name: string;
          reporting_unit: string;
          timezone: string;
          working_hours_per_day: number;
        };
        kind: "create";
      }
    | { id: string; kind: "existing" },
    XeroOAuthError
  >
> {
  const existingOrganisations = await database.organisation.findMany({
    orderBy: { created_at: "asc" },
    select: {
      country_code: true,
      id: true,
    },
    where: {
      archived_at: null,
      clerk_org_id: input.clerkOrgId,
    },
  });

  if (existingOrganisations.length === 0) {
    const defaults = organisationDefaultsForRegion(input.tenantPayrollRegion);
    return {
      ok: true,
      value: {
        create: {
          clerk_org_id: input.clerkOrgId,
          country_code: defaults.countryCode,
          locale: defaults.locale,
          name: input.tenantName,
          reporting_unit: defaults.reportingUnit,
          timezone: defaults.timezone,
          working_hours_per_day: defaults.workingHoursPerDay,
        },
        kind: "create",
      },
    };
  }

  if (!input.organisationId) {
    return {
      error: {
        code: "invalid_organisation_selection",
        message:
          "Select an existing payroll organisation before finalising the Xero connection.",
      },
      ok: false,
    };
  }

  const organisation = await database.organisation.findFirst({
    select: {
      country_code: true,
      id: true,
    },
    where: {
      archived_at: null,
      clerk_org_id: input.clerkOrgId,
      id: input.organisationId,
    },
  });
  if (!organisation) {
    return {
      error: {
        code: "organisation_not_found",
        message: "Organisation not found for the selected Xero tenant.",
      },
      ok: false,
    };
  }

  const expectedCountryCode =
    input.tenantPayrollRegion === "UK" ? "UK" : input.tenantPayrollRegion;
  if (organisation.country_code !== expectedCountryCode) {
    return {
      error: {
        code: "invalid_country",
        message:
          "The selected Xero tenant does not match this Clerk organisation country.",
      },
      ok: false,
    };
  }

  return { ok: true, value: { id: organisation.id, kind: "existing" } };
}

async function provisionNewOrganisationDefaults(input: {
  clerkOrgId: string;
  organisationId: string;
}): Promise<void> {
  const defaultFeed = await ensureDefaultCalendarFeed(input);
  if (!defaultFeed.ok) {
    log.error("Failed to provision the default feed after Xero connection", {
      clerkOrgId: input.clerkOrgId,
      error: defaultFeed.error,
      organisationId: input.organisationId,
    });
  }
  const publicHolidays = await ensureDefaultPublicHolidaysForOrganisation({
    // The OAuth boundary has already validated both IDs against persisted rows.
    clerkOrgId: input.clerkOrgId as ClerkOrgId,
    organisationId: input.organisationId as OrganisationId,
  });
  if (!publicHolidays.ok) {
    log.error("Failed to provision public holidays after Xero connection", {
      clerkOrgId: input.clerkOrgId,
      error: publicHolidays.error,
      organisationId: input.organisationId,
    });
  }
}

async function inferPayrollRegionForTenant(input: {
  accessToken: string;
  orgKey: string;
  tenantId: string;
}): Promise<
  Result<
    {
      countryCode: string;
      payrollRegion: "AU" | "NZ" | "UK";
    },
    XeroOAuthError
  >
> {
  const response = await xeroFetch({
    init: {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${input.accessToken}`,
        "Xero-Tenant-Id": input.tenantId,
      },
      method: "GET",
    },
    orgKey: input.orgKey,
    url: XERO_ORGANISATION_URL,
  });

  if (!response.ok) {
    return {
      error: {
        code: "unknown_error",
        message:
          "Failed to load Xero organisation details for region detection.",
      },
      ok: false,
    };
  }

  const payload = (await response.json()) as XeroOrganisationResponse;
  const countryCode =
    payload.Organisations?.[0]?.CountryCode?.trim().toUpperCase() ?? "";
  const payrollRegion = payrollRegionForCountry(countryCode);
  if (!payrollRegion) {
    return {
      error: {
        code: "invalid_country",
        message:
          "This Xero tenant is outside Team Calendar's supported payroll regions.",
      },
      ok: false,
    };
  }

  return {
    ok: true,
    value: {
      countryCode,
      payrollRegion,
    },
  };
}

async function loadPendingSession(input: {
  clerkOrgId: string;
  sessionId: string;
  userId: string;
}): Promise<
  Result<
    {
      access_token_auth_tag: null | string;
      access_token_encrypted: string;
      access_token_iv: null | string;
      available_tenants_json: unknown;
      expires_at: Date;
      id: string;
      organisation_id: null | string;
      refresh_token_auth_tag: null | string;
      refresh_token_encrypted: string;
      refresh_token_iv: null | string;
      return_to: string;
      token_expires_at: Date;
    },
    XeroOAuthError
  >
> {
  const session = await database.xeroOAuthSession.findFirst({
    select: {
      access_token_auth_tag: true,
      access_token_encrypted: true,
      access_token_iv: true,
      available_tenants_json: true,
      expires_at: true,
      id: true,
      organisation_id: true,
      refresh_token_auth_tag: true,
      refresh_token_encrypted: true,
      refresh_token_iv: true,
      return_to: true,
      token_expires_at: true,
    },
    where: {
      clerk_org_id: input.clerkOrgId,
      created_by_user_id: input.userId,
      expires_at: { gt: new Date() },
      id: input.sessionId,
      status: "pending",
    },
  });
  if (!session) {
    return {
      error: {
        code: "session_not_found",
        message:
          "This Xero OAuth session has expired or is no longer available.",
      },
      ok: false,
    };
  }
  return { ok: true, value: session };
}

function readAvailableTenants(payload: unknown): PendingXeroSessionTenant[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const tenants = "tenants" in payload ? payload.tenants : null;
  if (!Array.isArray(tenants)) {
    return [];
  }

  return tenants.flatMap((tenant) => {
    if (!tenant || typeof tenant !== "object") {
      return [];
    }

    const tenantId =
      "tenantId" in tenant && typeof tenant.tenantId === "string"
        ? tenant.tenantId
        : null;
    const connectionId =
      "connectionId" in tenant && typeof tenant.connectionId === "string"
        ? tenant.connectionId
        : null;
    const tenantName =
      "tenantName" in tenant && typeof tenant.tenantName === "string"
        ? tenant.tenantName
        : null;

    return connectionId && tenantId && tenantName
      ? [{ connectionId, tenantId, tenantName }]
      : [];
  });
}

async function exchangeToken(input: {
  code?: string;
  grantType: "authorization_code" | "refresh_token";
  onResponseAccepted?: () => void;
  orgKey: string;
  refreshToken?: string;
}): Promise<Result<TokenResponse, XeroOAuthError>> {
  const clientId = keys().XERO_CLIENT_ID;
  const clientSecret = keys().XERO_CLIENT_SECRET;
  if (!(clientId && clientSecret)) {
    return oauthNotConfigured();
  }

  const body = new URLSearchParams();
  body.set("grant_type", input.grantType);
  if (input.grantType === "authorization_code") {
    body.set("code", input.code ?? "");
    body.set("redirect_uri", callbackUrl());
  } else {
    body.set("refresh_token", input.refreshToken ?? "");
  }

  let response: Response;
  try {
    response = await xeroFetch({
      init: {
        body,
        headers: {
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        method: "POST",
      },
      orgKey: input.orgKey,
      url: XERO_TOKEN_URL,
    });
  } catch {
    return {
      error: {
        code: "network_error",
        message: "Xero token exchange could not reach Xero. Try again.",
      },
      ok: false,
    };
  }
  if (!response.ok) {
    return {
      error: await classifyTokenExchangeFailure(response, input.grantType),
      ok: false,
    };
  }

  input.onResponseAccepted?.();
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return {
      error: {
        code: "invalid_token_response",
        message: "Xero token response was invalid.",
      },
      ok: false,
    };
  }

  const parsed = TokenResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      error: {
        code: "invalid_token_response",
        message: "Xero token response was invalid.",
      },
      ok: false,
    };
  }

  return { ok: true, value: parsed.data };
}

async function classifyTokenExchangeFailure(
  response: Response,
  grantType: "authorization_code" | "refresh_token"
): Promise<XeroOAuthError> {
  if (response.status >= 500 && response.status < 600) {
    return {
      code: "network_error",
      message: "Xero token exchange is temporarily unavailable. Try again.",
    };
  }
  if (grantType !== "refresh_token") {
    return {
      code: "unknown_error",
      message: "Xero token exchange failed.",
    };
  }

  const errorCode = await readOAuthErrorCode(response);
  if (errorCode === "invalid_grant" || errorCode === "refresh_token_invalid") {
    return {
      code: "refresh_token_invalid",
      message: "The Xero refresh token is no longer valid. Reconnect Xero.",
    };
  }
  if (errorCode === "unauthorized_client" || errorCode === "invalid_client") {
    return {
      code: "client_credentials_invalid",
      message:
        "The Xero client credentials are no longer valid. Contact support.",
    };
  }
  return {
    code: "unknown_error",
    message: "Xero token exchange failed.",
  };
}

async function readOAuthErrorCode(response: Response): Promise<null | string> {
  try {
    const parsed = OAuthErrorResponseSchema.safeParse(await response.json());
    return parsed.success ? parsed.data.error : null;
  } catch {
    return null;
  }
}

async function fetchConnections(
  accessToken: string,
  orgKey: string
): Promise<Result<ConnectionResponse[], XeroOAuthError>> {
  const response = await xeroFetch({
    init: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      method: "GET",
    },
    orgKey,
    url: XERO_CONNECTIONS_URL,
  });
  if (!response.ok) {
    return {
      error: {
        code: "unknown_error",
        message: "Failed to load Xero tenants.",
      },
      ok: false,
    };
  }

  const payload = (await response.json()) as Array<
    Partial<ConnectionResponse> & { id?: string }
  >;
  return {
    ok: true,
    value: payload.flatMap((item) =>
      typeof item.id === "string" &&
      typeof item.tenantId === "string" &&
      typeof item.tenantName === "string"
        ? [
            {
              connectionId: item.id,
              tenantId: item.tenantId,
              tenantName: item.tenantName,
            },
          ]
        : []
    ),
  };
}

function organisationDefaultsForRegion(payrollRegion: "AU" | "NZ" | "UK") {
  if (payrollRegion === "NZ") {
    return {
      countryCode: "NZ",
      locale: "en-NZ",
      reportingUnit: "hours",
      timezone: "Pacific/Auckland",
      workingHoursPerDay: 8,
    };
  }

  if (payrollRegion === "UK") {
    return {
      countryCode: "UK",
      locale: "en-GB",
      reportingUnit: "hours",
      timezone: "Europe/London",
      workingHoursPerDay: 8,
    };
  }

  return {
    countryCode: "AU",
    locale: "en-AU",
    reportingUnit: "hours",
    timezone: "Australia/Sydney",
    workingHoursPerDay: 7.6,
  };
}

// Xero requires every redirect URI to be pre-registered on the app, so the
// callback must resolve to a single fixed URL. XERO_REDIRECT_URI pins it
// explicitly to the registered production callback; otherwise it is derived
// from the API (or app) public URL. Preview deployments do not register their
// own callback: Xero connect is gated off on preview, so this only ever runs
// in production or local development.
function callbackUrl(): string {
  const registeredUri = keys().XERO_REDIRECT_URI;
  if (registeredUri) {
    return registeredUri;
  }
  const baseUrl =
    process.env.NEXT_PUBLIC_API_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (!baseUrl) {
    throw new Error(
      "XERO_REDIRECT_URI, NEXT_PUBLIC_API_URL or NEXT_PUBLIC_APP_URL is required for Xero OAuth."
    );
  }
  return `${baseUrl}/api/xero/oauth/callback`;
}

// Preview deployments get a fresh, unregistered Vercel URL, so the Xero OAuth
// redirect would never match a pre-registered callback. The launch strategy is
// to register a single production callback and disable Xero connect on preview
// deployments. Production and local development remain enabled.
export function isPreviewDeployment(): boolean {
  return process.env.VERCEL_ENV === "preview";
}

function payrollRegionForCountry(
  countryCode: string
): "AU" | "NZ" | "UK" | null {
  if (countryCode === "AU") {
    return "AU";
  }
  if (countryCode === "NZ") {
    return "NZ";
  }
  if (countryCode === "UK" || countryCode === "GB") {
    return "UK";
  }
  return null;
}

// Domain-separation label for HKDF. Scoped to this exact purpose so the derived
// key can never be reused to forge or verify anything else, even if the same
// Xero client secret is also used for Basic Auth against the Xero token endpoint.
const STATE_SIGNING_KEY_INFO = "team-calendar:xero-oauth-state:v1";

// The OAuth `state` parameter is a signed (not encrypted) anti-CSRF token: HMAC-SHA256
// is the correct primitive for authenticating it, not a password hash. Deriving a
// dedicated signing key via HKDF (rather than passing the Xero client secret straight
// into the HMAC) keeps this key cryptographically independent of the client secret's
// other use as a Basic Auth credential against Xero.
function deriveStateSigningKey(clientSecret: string): Buffer {
  return Buffer.from(
    hkdfSync("sha256", clientSecret, "", STATE_SIGNING_KEY_INFO, 32)
  );
}

function signState(payload: OAuthStatePayload, clientSecret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signingKey = deriveStateSigningKey(clientSecret);
  const signature = createHmac("sha256", signingKey)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

function verifyState(value: string): Result<OAuthStatePayload, XeroOAuthError> {
  const clientSecret = stateSecret();
  if (!clientSecret) {
    return oauthNotConfigured();
  }

  const [encoded, signature] = value.split(".");
  if (!(encoded && signature)) {
    return invalidState();
  }

  const signingKey = deriveStateSigningKey(clientSecret);
  const expected = createHmac("sha256", signingKey)
    .update(encoded)
    .digest("base64url");
  const matches =
    expected.length === signature.length &&
    timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  if (!matches) {
    return invalidState();
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    ) as Partial<OAuthStatePayload>;
    if (
      typeof payload.clerkOrgId !== "string" ||
      typeof payload.returnTo !== "string" ||
      typeof payload.nonce !== "string" ||
      typeof payload.issuedAt !== "number" ||
      Date.now() - payload.issuedAt > STATE_MAX_AGE_MS
    ) {
      return invalidState();
    }
    return {
      ok: true,
      value: {
        clerkOrgId: payload.clerkOrgId,
        issuedAt: payload.issuedAt,
        nonce: payload.nonce,
        organisationId:
          typeof payload.organisationId === "string"
            ? payload.organisationId
            : null,
        returnTo: payload.returnTo,
        userId: typeof payload.userId === "string" ? payload.userId : null,
      },
    };
  } catch {
    return invalidState();
  }
}

function invalidState(): Result<never, XeroOAuthError> {
  return {
    error: {
      code: "invalid_state",
      message: "The Xero OAuth state was invalid.",
    },
    ok: false,
  };
}

function oauthNotConfigured(): Result<never, XeroOAuthError> {
  return {
    error: {
      code: "oauth_not_configured",
      message: "Xero OAuth is not configured for this environment.",
    },
    ok: false,
  };
}

function xeroConnectDisabled(): Result<never, XeroOAuthError> {
  return {
    error: {
      code: "connect_disabled",
      message:
        "Connecting Xero is disabled on preview deployments. Use the production deployment to connect Xero.",
    },
    ok: false,
  };
}

function stateSecret(): null | string {
  return keys().XERO_CLIENT_SECRET ?? null;
}
