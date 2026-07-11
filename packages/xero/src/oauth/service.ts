import "server-only";

import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { ensureDefaultPublicHolidaysForOrganisation } from "@repo/availability";
import type { ClerkOrgId, OrganisationId, Result } from "@repo/core";
import { database } from "@repo/database";
import type { Prisma } from "@repo/database/generated/client";
import { ensureDefaultCalendarFeed } from "@repo/feeds";
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

interface OAuthStatePayload {
  clerkOrgId: string;
  organisationId: null | string;
  returnTo: string;
  userId: null | string;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
}

interface ConnectionResponse {
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
  tenantId: string;
  tenantName: string;
}

export type XeroOAuthError =
  | { code: "connect_disabled"; message: string }
  | { code: "connection_inactive"; message: string }
  | { code: "invalid_country"; message: string }
  | { code: "invalid_organisation_selection"; message: string }
  | { code: "invalid_state"; message: string }
  | { code: "oauth_not_configured"; message: string }
  | { code: "organisation_not_found"; message: string }
  | { code: "session_not_found"; message: string }
  | { code: "tenant_not_found"; message: string }
  | { code: "unknown_error"; message: string };

export function buildXeroOAuthStartUrl(input: {
  clerkOrgId: string;
  organisationId?: null | string;
  returnTo?: string;
  userId?: null | string;
}): Result<{ redirectUrl: string }, XeroOAuthError> {
  if (isPreviewDeployment()) {
    return xeroConnectDisabled();
  }

  const clientId = keys().XERO_CLIENT_ID;
  const clientSecret = keys().XERO_CLIENT_SECRET;
  if (!(clientId && clientSecret)) {
    return oauthNotConfigured();
  }

  const url = new URL(XERO_AUTHORISE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", callbackUrl());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", XERO_SCOPES);
  url.searchParams.set(
    "state",
    signState(
      {
        clerkOrgId: input.clerkOrgId,
        organisationId: input.organisationId ?? null,
        returnTo: input.returnTo ?? "/settings/integrations/xero",
        userId: input.userId ?? null,
      },
      clientSecret
    )
  );

  return { ok: true, value: { redirectUrl: url.toString() } };
}

export async function completeXeroOAuth(input: {
  code: string;
  state: string;
}): Promise<Result<{ redirectTo: string; sessionId: string }, XeroOAuthError>> {
  const state = verifyState(input.state);
  if (!state.ok) {
    return state;
  }

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
      return_to: state.value.returnTo,
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

export async function getPendingXeroOAuthSession(input: {
  clerkOrgId: string;
  sessionId: string;
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
    where: {
      archived_at: null,
      clerk_org_id: input.clerkOrgId,
    },
    orderBy: [{ created_at: "asc" }, { name: "asc" }],
    select: {
      country_code: true,
      id: true,
      name: true,
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

export async function completeXeroTenantSelection(input: {
  clerkOrgId: string;
  organisationId?: null | string;
  sessionId: string;
  tenantId: string;
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
      ok: false,
      error: {
        code: "tenant_not_found",
        message:
          "The selected Xero tenant was not found in this OAuth session.",
      },
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

  const payrollRegion = payrollRegionResult.value.payrollRegion;
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
  const [connection, xeroTenant] = await database.$transaction(async (tx) => {
    const nextConnection = await tx.xeroConnection.upsert({
      where: { organisation_id: organisation.value.id },
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
        organisation_id: organisation.value.id,
        refresh_token_auth_tag: encryptedRefreshToken.authTag,
        refresh_token_encrypted: encryptedRefreshToken.encrypted,
        refresh_token_iv: encryptedRefreshToken.iv,
        revoked_at: null,
        stale_since: null,
        status: "active",
        token_encrypted_at: encryptedAccessToken.encryptedAt,
        token_key_version: encryptedAccessToken.keyVersion,
      },
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
      },
      select: { id: true },
    });

    const nextTenant = await tx.xeroTenant.upsert({
      where: { xero_connection_id: nextConnection.id },
      create: {
        clerk_org_id: input.clerkOrgId,
        organisation_id: organisation.value.id,
        payroll_region: payrollRegion,
        tenant_name: selectedTenant.tenantName,
        xero_connection_id: nextConnection.id,
        xero_tenant_id: selectedTenant.tenantId,
      },
      update: {
        payroll_region: payrollRegion,
        tenant_name: selectedTenant.tenantName,
        xero_tenant_id: selectedTenant.tenantId,
      },
      select: { id: true },
    });

    await tx.xeroOAuthSession.update({
      where: { id: session.id },
      data: {
        organisation_id: organisation.value.id,
        selected_payroll_region: payrollRegion,
        selected_tenant_id: selectedTenant.tenantId,
        selected_tenant_name: selectedTenant.tenantName,
        status: "completed",
      },
    });

    return [nextConnection, nextTenant] as const;
  });

  return {
    ok: true,
    value: {
      connectionId: connection.id,
      organisationId: organisation.value.id,
      returnTo: session.return_to,
      xeroTenantId: xeroTenant.id,
    },
  };
}

export async function refreshXeroOAuthConnection(input: {
  clerkOrgId: string;
  connectionId: string;
  organisationId: string;
}): Promise<Result<{ refreshedAt: Date }, XeroOAuthError>> {
  const refreshed = await refreshXeroOAuthConnectionWithClient(database, input);
  if (!refreshed.ok) {
    return refreshed;
  }

  return {
    ok: true,
    value: { refreshedAt: refreshed.value.refreshedAt },
  };
}

async function refreshXeroOAuthConnectionWithClient(
  client: Pick<Prisma.TransactionClient, "xeroConnection">,
  input: {
    clerkOrgId: string;
    connectionId: string;
    organisationId: string;
  }
): Promise<Result<{ expiresAt: Date; refreshedAt: Date }, XeroOAuthError>> {
  const connection = await client.xeroConnection.findFirst({
    where: {
      clerk_org_id: input.clerkOrgId,
      id: input.connectionId,
      organisation_id: input.organisationId,
    },
    select: {
      id: true,
      refresh_token_auth_tag: true,
      refresh_token_encrypted: true,
      refresh_token_iv: true,
    },
  });
  if (!connection) {
    return {
      ok: false,
      error: {
        code: "organisation_not_found",
        message: "Xero connection not found.",
      },
    };
  }

  const token = await exchangeToken({
    grantType: "refresh_token",
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
    return token;
  }

  const refreshedAt = new Date();
  const encryptedAccessToken = encryptXeroToken(token.value.access_token);
  const encryptedRefreshToken = encryptXeroToken(token.value.refresh_token);
  const expiresAt = new Date(
    refreshedAt.getTime() + token.value.expires_in * 1000
  );

  await client.xeroConnection.update({
    where: { id: input.connectionId },
    data: {
      access_token_auth_tag: encryptedAccessToken.authTag,
      access_token_encrypted: encryptedAccessToken.encrypted,
      access_token_iv: encryptedAccessToken.iv,
      disconnected_at: null,
      disconnected_by_user_id: null,
      expires_at: expiresAt,
      last_error_code: null,
      last_error_message: null,
      last_refreshed_at: refreshedAt,
      refresh_token_auth_tag: encryptedRefreshToken.authTag,
      refresh_token_encrypted: encryptedRefreshToken.encrypted,
      refresh_token_iv: encryptedRefreshToken.iv,
      revoked_at: null,
      stale_since: null,
      status: "active",
      token_encrypted_at: encryptedAccessToken.encryptedAt,
      token_key_version: encryptedAccessToken.keyVersion,
    },
  });

  return { ok: true, value: { expiresAt, refreshedAt } };
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
  organisationId: string;
  now?: Date;
}): Promise<Result<{ expiresAt: Date; refreshed: boolean }, XeroOAuthError>> {
  const now = input.now ?? new Date();
  const connection = await database.xeroConnection.findFirst({
    where: {
      clerk_org_id: input.clerkOrgId,
      id: input.connectionId,
      organisation_id: input.organisationId,
    },
    select: {
      access_token_encrypted: true,
      expires_at: true,
      refresh_token_encrypted: true,
      revoked_at: true,
      status: true,
    },
  });
  if (!connection) {
    return {
      ok: false,
      error: {
        code: "organisation_not_found",
        message: "Xero connection not found.",
      },
    };
  }

  const decision = xeroConnectionRefreshDecision(
    {
      expiresAt: connection.expires_at,
      hasAccessToken: connection.access_token_encrypted.length > 0,
      hasRefreshToken: connection.refresh_token_encrypted.length > 0,
      revokedAt: connection.revoked_at,
      status: connection.status,
    },
    now
  );
  if (decision === "inactive") {
    return {
      ok: false,
      error: {
        code: "connection_inactive",
        message: "Xero connection is not active; reconnect required.",
      },
    };
  }
  if (decision === "active") {
    return {
      ok: true,
      value: { expiresAt: connection.expires_at, refreshed: false },
    };
  }

  try {
    return await database.$transaction(
      async (tx) => {
        // Serialise refreshes for this connection across all instances. The lock is
        // transaction-scoped, so it releases automatically on commit or rollback.
        // Any future token rotation write path must take this same lock key.
        await tx.$queryRaw`
          SELECT pg_advisory_xact_lock(hashtextextended(${input.connectionId}, 0))
        `;

        // Re-read inside the lock: a concurrent winner may have refreshed already.
        const current = await tx.xeroConnection.findFirst({
          where: {
            clerk_org_id: input.clerkOrgId,
            id: input.connectionId,
            organisation_id: input.organisationId,
          },
          select: {
            access_token_encrypted: true,
            expires_at: true,
            refresh_token_auth_tag: true,
            refresh_token_encrypted: true,
            refresh_token_iv: true,
            revoked_at: true,
            status: true,
          },
        });
        if (!current) {
          return {
            ok: false,
            error: {
              code: "organisation_not_found",
              message: "Xero connection not found.",
            },
          };
        }

        const lockedDecision = xeroConnectionRefreshDecision(
          {
            expiresAt: current.expires_at,
            hasAccessToken: current.access_token_encrypted.length > 0,
            hasRefreshToken: current.refresh_token_encrypted.length > 0,
            revokedAt: current.revoked_at,
            status: current.status,
          },
          now
        );
        if (lockedDecision === "inactive") {
          return {
            ok: false,
            error: {
              code: "connection_inactive",
              message: "Xero connection is not active; reconnect required.",
            },
          };
        }
        if (lockedDecision === "active") {
          return {
            ok: true,
            value: { expiresAt: current.expires_at, refreshed: false },
          };
        }

        const refreshed = await refreshXeroOAuthConnectionWithClient(tx, {
          clerkOrgId: input.clerkOrgId,
          connectionId: input.connectionId,
          organisationId: input.organisationId,
        });
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
    return {
      ok: false,
      error: {
        code: "unknown_error",
        message: "Failed to refresh the Xero connection.",
      },
    };
  }
}

export async function disconnectXeroOAuthConnection(input: {
  clerkOrgId: string;
  connectionId: string;
  destructive: boolean;
  organisationId: string;
  performedByUserId?: null | string;
}): Promise<Result<{ disconnected: true }, XeroOAuthError>> {
  const connection = await database.xeroConnection.findFirst({
    where: {
      clerk_org_id: input.clerkOrgId,
      id: input.connectionId,
      organisation_id: input.organisationId,
    },
    select: {
      id: true,
      xero_tenant: { select: { id: true } },
    },
  });
  if (!connection) {
    return {
      ok: false,
      error: {
        code: "organisation_not_found",
        message: "Xero connection not found.",
      },
    };
  }

  const now = new Date();
  await database.$transaction(async (tx) => {
    await tx.xeroConnection.update({
      where: { id: connection.id },
      data: {
        access_token_auth_tag: null,
        access_token_encrypted: "",
        access_token_iv: null,
        disconnected_at: now,
        disconnected_by_user_id: input.performedByUserId ?? null,
        expires_at: now,
        last_disconnected_at: now,
        refresh_token_auth_tag: null,
        refresh_token_encrypted: "",
        refresh_token_iv: null,
        status: "disconnected",
      },
    });

    if (input.destructive) {
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
        where: {
          clerk_org_id: input.clerkOrgId,
          organisation_id: input.organisationId,
          source_system: "XERO",
        },
        data: {
          archived_at: now,
          clerk_user_id: null,
        },
      });
      await tx.person.updateMany({
        where: {
          clerk_org_id: input.clerkOrgId,
          organisation_id: input.organisationId,
        },
        data: { xero_employee_id: null },
      });
      await tx.availabilityRecord.updateMany({
        where: {
          clerk_org_id: input.clerkOrgId,
          organisation_id: input.organisationId,
          source_type: { in: ["xero", "xero_leave"] },
        },
        data: {
          archived_at: now,
          publish_status: "archived",
        },
      });
      if (connection.xero_tenant) {
        await tx.syncRun.deleteMany({
          where: {
            clerk_org_id: input.clerkOrgId,
            organisation_id: input.organisationId,
            xero_tenant_id: connection.xero_tenant.id,
          },
        });
        await tx.xeroSyncCursor.deleteMany({
          where: {
            clerk_org_id: input.clerkOrgId,
            organisation_id: input.organisationId,
            xero_tenant_id: connection.xero_tenant.id,
          },
        });
      }
    }
  });

  return { ok: true, value: { disconnected: true } };
}

export async function markXeroConnectionStale(input: {
  clerkOrgId: string;
  connectionId: string;
  errorCode: string;
  errorMessage: string;
  organisationId: string;
}): Promise<void> {
  await database.xeroConnection.updateMany({
    where: {
      clerk_org_id: input.clerkOrgId,
      id: input.connectionId,
      organisation_id: input.organisationId,
    },
    data: {
      last_error_code: input.errorCode,
      last_error_message: input.errorMessage,
      stale_since: new Date(),
      status: "stale",
    },
  });
}

async function resolveOrganisationForTenantSelection(input: {
  clerkOrgId: string;
  organisationId: null | string;
  tenantName: string;
  tenantPayrollRegion: "AU" | "NZ" | "UK";
}): Promise<Result<{ id: string }, XeroOAuthError>> {
  const existingOrganisations = await database.organisation.findMany({
    where: {
      archived_at: null,
      clerk_org_id: input.clerkOrgId,
    },
    orderBy: { created_at: "asc" },
    select: {
      country_code: true,
      id: true,
    },
  });

  if (existingOrganisations.length === 0) {
    const defaults = organisationDefaultsForRegion(input.tenantPayrollRegion);
    const organisation = await database.organisation.create({
      data: {
        clerk_org_id: input.clerkOrgId,
        country_code: defaults.countryCode,
        locale: defaults.locale,
        name: input.tenantName,
        reporting_unit: defaults.reportingUnit,
        timezone: defaults.timezone,
        working_hours_per_day: defaults.workingHoursPerDay,
      },
      select: { id: true },
    });
    const defaultFeed = await ensureDefaultCalendarFeed({
      clerkOrgId: input.clerkOrgId,
      organisationId: organisation.id,
    });
    if (!defaultFeed.ok) {
      return {
        ok: false,
        error: {
          code: "unknown_error",
          message: defaultFeed.error.message,
        },
      };
    }
    // Provision default public holidays; ignore errors (non-blocking)
    await ensureDefaultPublicHolidaysForOrganisation({
      clerkOrgId: input.clerkOrgId as ClerkOrgId,
      organisationId: organisation.id as OrganisationId,
    });
    return { ok: true, value: { id: organisation.id } };
  }

  if (!input.organisationId) {
    return {
      ok: false,
      error: {
        code: "invalid_organisation_selection",
        message:
          "Select an existing payroll organisation before finalising the Xero connection.",
      },
    };
  }

  const organisation = await database.organisation.findFirst({
    where: {
      archived_at: null,
      clerk_org_id: input.clerkOrgId,
      id: input.organisationId,
    },
    select: {
      country_code: true,
      id: true,
    },
  });
  if (!organisation) {
    return {
      ok: false,
      error: {
        code: "organisation_not_found",
        message: "Organisation not found for the selected Xero tenant.",
      },
    };
  }

  const expectedCountryCode =
    input.tenantPayrollRegion === "UK" ? "UK" : input.tenantPayrollRegion;
  if (organisation.country_code !== expectedCountryCode) {
    return {
      ok: false,
      error: {
        code: "invalid_country",
        message:
          "The selected Xero tenant does not match this Clerk organisation country.",
      },
    };
  }

  return { ok: true, value: { id: organisation.id } };
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
      ok: false,
      error: {
        code: "unknown_error",
        message:
          "Failed to load Xero organisation details for region detection.",
      },
    };
  }

  const payload = (await response.json()) as XeroOrganisationResponse;
  const countryCode =
    payload.Organisations?.[0]?.CountryCode?.trim().toUpperCase() ?? "";
  const payrollRegion = payrollRegionForCountry(countryCode);
  if (!payrollRegion) {
    return {
      ok: false,
      error: {
        code: "invalid_country",
        message:
          "This Xero tenant is outside Team Calendar's supported payroll regions.",
      },
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
    where: {
      clerk_org_id: input.clerkOrgId,
      expires_at: { gt: new Date() },
      id: input.sessionId,
      status: "pending",
    },
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
  });
  if (!session) {
    return {
      ok: false,
      error: {
        code: "session_not_found",
        message:
          "This Xero OAuth session has expired or is no longer available.",
      },
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
    const tenantName =
      "tenantName" in tenant && typeof tenant.tenantName === "string"
        ? tenant.tenantName
        : null;

    return tenantId && tenantName ? [{ tenantId, tenantName }] : [];
  });
}

async function exchangeToken(input: {
  code?: string;
  grantType: "authorization_code" | "refresh_token";
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

  const response = await xeroFetch({
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
  if (!response.ok) {
    return {
      ok: false,
      error: {
        code: "unknown_error",
        message: "Xero token exchange failed.",
      },
    };
  }

  const payload = (await response.json()) as Partial<TokenResponse>;
  if (
    !(payload.access_token && payload.refresh_token) ||
    typeof payload.expires_in !== "number"
  ) {
    return {
      ok: false,
      error: {
        code: "unknown_error",
        message: "Xero token response was invalid.",
      },
    };
  }

  return {
    ok: true,
    value: {
      access_token: payload.access_token,
      expires_in: payload.expires_in,
      refresh_token: payload.refresh_token,
    },
  };
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
      ok: false,
      error: {
        code: "unknown_error",
        message: "Failed to load Xero tenants.",
      },
    };
  }

  const payload = (await response.json()) as Partial<ConnectionResponse>[];
  return {
    ok: true,
    value: payload.flatMap((item) =>
      typeof item.tenantId === "string" && typeof item.tenantName === "string"
        ? [{ tenantId: item.tenantId, tenantName: item.tenantName }]
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
      typeof payload.returnTo !== "string"
    ) {
      return invalidState();
    }
    return {
      ok: true,
      value: {
        clerkOrgId: payload.clerkOrgId,
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
    ok: false,
    error: {
      code: "invalid_state",
      message: "The Xero OAuth state was invalid.",
    },
  };
}

function oauthNotConfigured(): Result<never, XeroOAuthError> {
  return {
    ok: false,
    error: {
      code: "oauth_not_configured",
      message: "Xero OAuth is not configured for this environment.",
    },
  };
}

function xeroConnectDisabled(): Result<never, XeroOAuthError> {
  return {
    ok: false,
    error: {
      code: "connect_disabled",
      message:
        "Connecting Xero is disabled on preview deployments. Use the production deployment to connect Xero.",
    },
  };
}

function stateSecret(): null | string {
  return keys().XERO_CLIENT_SECRET ?? null;
}
