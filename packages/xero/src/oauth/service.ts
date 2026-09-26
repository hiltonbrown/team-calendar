import { createXeroDeadline, remainingMs } from "../rate-limit/deadline";
import { XERO_TOKEN_OPERATION_BUDGET_MS } from "../rate-limit/limits";
import "server-only";

import {
  createHash,
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
import type { XeroDeadline } from "../rate-limit/deadline";
import type { XeroRateClass } from "../rate-limit/shared-store";
import {
  parseRetryAfter,
  XeroFetchError,
  xeroFetch,
} from "../rate-limit/xero-fetch";
import {
  aggregateXeroDisconnectReceipt,
  freezeCleanupTargets,
  getXeroDisconnectReceipt,
  type XeroDisconnectReceipt,
} from "./connection-cleanup";
import {
  adoptXeroCredential,
  ownerMirror,
  refreshXeroCredentialOwner,
} from "./credential-owner";
import { verifyXeroAccessTokenIdentity } from "./identity";
import {
  boundXeroLocks,
  lockXeroBinding,
  lockXeroConnection,
  lockXeroOwner,
} from "./locks";

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
  sessionId: string;
  userId: null | string;
}

const TokenResponseSchema = z.object({
  access_token: z.string().trim().min(1),
  expires_in: z.number().finite().int().positive(),
  refresh_token: z.string().trim().min(1),
  scope: z.string().optional(),
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

export type XeroOAuthError = {
  dispatched?: boolean;
  transportCode?: string;
  httpStatus?: number;
  retryAfterMs?: number;
} & (
  | { code: "already_refreshed"; message: string }
  | { code: "connect_disabled"; message: string }
  | { code: "client_credentials_invalid"; message: string }
  | { code: "connection_changed"; message: string }
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
  | { code: "tenant_binding_conflict"; message: string }
  | { code: "cleanup_unresolved"; message: string }
  | { code: "tenant_not_found"; message: string }
  | { code: "tenant_replacement_required"; message: string }
  | { code: "unknown_error"; message: string }
);

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

class OrganisationSelectionRaceError extends Error {}

class TenantSelectionRejectedError extends Error {
  readonly code:
    | "connection_changed"
    | "tenant_binding_conflict"
    | "cleanup_unresolved"
    | "tenant_replacement_required";

  constructor(
    code: TenantSelectionRejectedError["code"],
    options?: ErrorOptions
  ) {
    super(code, options);
    this.code = code;
  }
}

export async function buildXeroOAuthStartUrl(input: {
  clerkOrgId: string;
  organisationId?: null | string;
  returnTo?: string;
  userId?: null | string;
}): Promise<Result<{ nonce: string; redirectUrl: string }, XeroOAuthError>> {
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

  try {
    const url = new URL(XERO_AUTHORISE_URL);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", callbackUrl());
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", XERO_SCOPES);
    const nonce = randomBytes(32).toString("base64url");
    const existingTenant = input.organisationId
      ? await database.xeroTenant.findFirst({
          select: { binding_generation: true },
          where: {
            clerk_org_id: input.clerkOrgId,
            organisation_id: input.organisationId,
          },
        })
      : null;
    const session = await database.xeroOAuthSession.create({
      data: {
        clerk_org_id: input.clerkOrgId,
        created_by_user_id: input.userId ?? null,
        expected_binding_generation: existingTenant?.binding_generation ?? null,
        expires_at: new Date(Date.now() + 15 * 60_000),
        intent_kind: existingTenant
          ? "same_file_reauthorisation"
          : "initial_binding",
        nonce_hash: createHash("sha256").update(nonce).digest("hex"),
        organisation_id: input.organisationId ?? null,
        requested_scopes: XERO_SCOPES.split(" "),
        return_to: input.returnTo ?? DEFAULT_XERO_RETURN_TO,
        status: "pending",
        token_exchange_status: "not_started",
      },
      select: { id: true },
    });
    url.searchParams.set(
      "state",
      signState(
        {
          clerkOrgId: input.clerkOrgId,
          issuedAt: Date.now(),
          nonce,
          organisationId: input.organisationId ?? null,
          returnTo: input.returnTo ?? DEFAULT_XERO_RETURN_TO,
          sessionId: session.id,
          userId: input.userId ?? null,
        },
        clientSecret
      )
    );

    return { ok: true, value: { nonce, redirectUrl: url.toString() } };
  } catch {
    return {
      error: {
        code: "unknown_error",
        message: "Could not start the Xero connection. Try again.",
      },
      ok: false,
    };
  }
}

export async function completeXeroOAuth(input: {
  code: string;
  nonce: null | string;
  state: string;
}): Promise<Result<{ redirectTo: string; sessionId: string }, XeroOAuthError>> {
  try {
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

    const _returnTo = isLocalApplicationPath(state.value.returnTo)
      ? state.value.returnTo
      : DEFAULT_XERO_RETURN_TO;

    const session = await database.xeroOAuthSession.findFirst({
      where: {
        clerk_org_id: state.value.clerkOrgId,
        created_by_user_id: state.value.userId,
        expires_at: { gt: new Date() },
        id: state.value.sessionId,
        status: "pending",
      },
    });
    const nonceHash = createHash("sha256")
      .update(input.nonce ?? "")
      .digest("hex");
    if (
      !session?.nonce_hash ||
      session.nonce_hash.length !== nonceHash.length ||
      !timingSafeEqual(Buffer.from(session.nonce_hash), Buffer.from(nonceHash))
    ) {
      return invalidState();
    }
    const claimed = await database.xeroOAuthSession.updateMany({
      data: { token_exchange_status: "dispatching" },
      where: {
        expires_at: { gt: new Date() },
        id: session.id,
        token_exchange_status: "not_started",
      },
    });
    if (claimed.count !== 1) {
      return invalidState();
    }
    const rateClass: XeroRateClass = {
      kind: "token",
      providerAppId: keys().XERO_CLIENT_ID ?? "",
    };
    const deadline = createXeroDeadline(XERO_TOKEN_OPERATION_BUDGET_MS);
    const token = await exchangeToken({
      code: input.code,
      deadline,
      grantType: "authorization_code",
      rateClass,
    });
    if (!token.ok) {
      await database.xeroOAuthSession.updateMany({
        data: { token_exchange_status: "unknown" },
        where: { id: session.id, token_exchange_status: "dispatching" },
      });
      return token;
    }
    const access = encryptXeroToken(token.value.access_token);
    const refresh = encryptXeroToken(token.value.refresh_token);
    // Persist the candidate before identity verification and inventory, never exchange this code twice.
    const persisted = await database.xeroOAuthSession.updateMany({
      data: {
        access_token_auth_tag: access.authTag,
        access_token_encrypted: access.encrypted,
        access_token_iv: access.iv,
        refresh_token_auth_tag: refresh.authTag,
        refresh_token_encrypted: refresh.encrypted,
        refresh_token_iv: refresh.iv,
        token_encrypted_at: access.encryptedAt,
        token_exchange_status: "exchanged",
        token_expires_at: new Date(Date.now() + token.value.expires_in * 1000),
        token_key_version: access.keyVersion,
      },
      where: { id: session.id, token_exchange_status: "dispatching" },
    });
    if (persisted.count !== 1) {
      return invalidState();
    }
    const adopted = await adoptXeroCredential({
      accessToken: token.value.access_token,
      deadline,
      refreshToken: token.value.refresh_token,
      scopes: token.value.scope,
    });
    if (!adopted.ok) {
      return adopted;
    }
    const identity = await verifyXeroAccessTokenIdentity(
      token.value.access_token
    );
    const connections = await fetchConnections(token.value.access_token, {
      kind: "user_inventory",
      providerAppId: keys().XERO_CLIENT_ID ?? "",
    });
    if (!connections.ok) {
      return connections;
    }
    for (const connection of connections.value) {
      const observation = {
        auth_event_id: identity.ok ? identity.value.authEventId : null,
        observed_at: new Date(),
        observed_via: "user_inventory",
        remote_status: "present" as const,
        xero_credential_owner_id: adopted.value.id,
        xero_tenant_id: connection.tenantId,
      };
      await database.xeroProviderConnection.upsert({
        create: {
          ...observation,
          provider_app_id: adopted.value.provider_app_id,
          remote_connection_id: connection.connectionId,
        },
        update: observation,
        where: {
          provider_app_id_remote_connection_id: {
            provider_app_id: adopted.value.provider_app_id,
            remote_connection_id: connection.connectionId,
          },
        },
      });
    }
    await database.xeroOAuthSession.update({
      data: {
        available_tenants_json: {
          tenants: connections.value.map((connection) => ({ ...connection })),
        },
      },
      where: { id: session.id },
    });

    return {
      ok: true,
      value: {
        redirectTo: `/settings/integrations/xero/connect?session=${session.id}`,
        sessionId: session.id,
      },
    };
  } catch {
    return {
      error: {
        code: "unknown_error",
        message: "The Xero connection could not be saved. Start again.",
      },
      ok: false,
    };
  }
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
    keyVersion: session.token_key_version,
  });
  const refreshToken = decryptXeroToken({
    authTag: session.refresh_token_auth_tag,
    encrypted: session.refresh_token_encrypted,
    iv: session.refresh_token_iv,
    keyVersion: session.token_key_version,
  });

  const providerAppId = keys().XERO_CLIENT_ID;
  if (!providerAppId) {
    return oauthNotConfigured();
  }

  const candidateIdentity = await verifyXeroAccessTokenIdentity(accessToken);
  const resolvedOwner = candidateIdentity.ok
    ? await database.xeroCredentialOwner.findUnique({
        where: {
          provider_app_id_xero_user_id: {
            provider_app_id: providerAppId,
            xero_user_id: candidateIdentity.value.xeroUserId,
          },
        },
      })
    : null;
  const providerConnection = resolvedOwner
    ? await database.xeroProviderConnection.findUnique({
        where: {
          provider_app_id_remote_connection_id: {
            provider_app_id: providerAppId,
            remote_connection_id: selectedTenant.connectionId,
          },
        },
      })
    : null;
  if (
    requiresVerifiedOwner(
      session.token_exchange_status,
      candidateIdentity.ok,
      resolvedOwner !== null,
      providerConnection !== null
    )
  ) {
    return {
      error: {
        code: "invalid_token_response",
        message: "This Xero authorisation could not be verified. Start again.",
      },
      ok: false,
    };
  }
  if (
    providerAssociationChanged(
      providerConnection,
      resolvedOwner?.id,
      selectedTenant.tenantId
    )
  ) {
    return {
      error: {
        code: "connection_changed",
        message: "This Xero connection changed. Start again.",
      },
      ok: false,
    };
  }
  const currentAccessToken = resolvedOwner
    ? decryptXeroToken({
        authTag: resolvedOwner.access_token_auth_tag,
        encrypted: resolvedOwner.access_token_encrypted,
        iv: resolvedOwner.access_token_iv,
        keyVersion: resolvedOwner.token_key_version,
      })
    : accessToken;
  const payrollRegionResult = await inferPayrollRegionForTenant({
    accessToken: currentAccessToken,
    rateClass: {
      kind: "tenant",
      providerAppId: keys().XERO_CLIENT_ID ?? "",
      xeroTenantId: selectedTenant.tenantId,
    },
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
      await boundXeroLocks(
        tx,
        createXeroDeadline(XERO_TOKEN_OPERATION_BUDGET_MS)
      );
      const currentOwner = await lockSelectionOwner(tx, {
        clerkOrgId: input.clerkOrgId,
        organisationId: input.organisationId ?? session.organisation_id,
        ownerId: resolvedOwner?.id ?? null,
      });
      const canonicalMirror = currentOwner ? ownerMirror(currentOwner) : {};

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

      await validateTenantSelectionBinding(tx, {
        clerkOrgId: input.clerkOrgId,
        expectedBindingGeneration: session.expected_binding_generation,
        organisationId,
        providerAppId,
        tenantId: selectedTenant.tenantId,
      });

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
          ...canonicalMirror,
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
          ...canonicalMirror,
        },
        where: { organisation_id: organisationId },
      });

      let nextTenant: { id: string };
      try {
        nextTenant = await tx.xeroTenant.upsert({
          create: {
            active_slot: 1,
            clerk_org_id: input.clerkOrgId,
            organisation_id: organisationId,
            payroll_region: payrollRegion,
            provider_app_id: providerAppId,
            tenant_name: selectedTenant.tenantName,
            xero_connection_id: nextConnection.id,
            xero_credential_owner_id: currentOwner?.id ?? null,
            xero_provider_connection_id: providerConnection?.id ?? null,
            xero_tenant_id: selectedTenant.tenantId,
          },
          select: { id: true },
          update: {
            active_slot: 1,
            binding_generation: { increment: 1 },
            payroll_region: payrollRegion,
            provider_app_id: providerAppId,
            retired_at: null,
            retirement_reason: null,
            tenant_name: selectedTenant.tenantName,
            xero_credential_owner_id: currentOwner?.id ?? null,
            xero_provider_connection_id: providerConnection?.id ?? null,
          },
          where: { xero_connection_id: nextConnection.id },
        });
      } catch (error) {
        if (
          // biome-ignore lint/suspicious/noUnnecessaryConditions: Prisma errors are untrusted runtime values.
          error !== null &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "P2002"
        ) {
          throw new TenantSelectionRejectedError("tenant_binding_conflict", {
            cause: error,
          });
        }
        throw error;
      }

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
    if (error instanceof TenantSelectionRejectedError) {
      const messages = {
        cleanup_unresolved:
          "A previous Xero disconnection is still being confirmed. Try again later or contact support.",
        connection_changed:
          "This Xero connection changed while you were connecting. Start the connection again.",
        tenant_binding_conflict:
          "This Xero file is already connected in Team Calendar and cannot be connected again.",
        tenant_replacement_required:
          "This payroll entity is already connected to a different Xero file. Connect the original Xero file, or add a new payroll entity for this one.",
      };
      return {
        error: { code: error.code, message: messages[error.code] },
        ok: false,
      };
    }
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
  const owned = await database.xeroTenant.findFirst({
    include: { credential_owner: true, xero_connection: true },
    where: {
      clerk_org_id: input.clerkOrgId,
      organisation_id: input.organisationId,
      xero_connection_id: input.connectionId,
      xero_credential_owner_id: { not: null },
    },
  });
  if (owned?.credential_owner) {
    if (
      owned.retired_at ||
      owned.active_slot !== 1 ||
      owned.xero_connection.disconnected_at ||
      owned.xero_connection.revoked_at ||
      !["active", "stale"].includes(owned.xero_connection.status)
    ) {
      return {
        error: {
          code: "connection_inactive",
          message: "This Xero connection is inactive.",
        },
        ok: false,
      };
    }
    const refreshed = await refreshXeroCredentialOwner({
      deadline: createXeroDeadline(XERO_TOKEN_OPERATION_BUDGET_MS),
      expectedTokenVersion: owned.credential_owner.token_version,
      ownerId: owned.credential_owner.id,
    });
    if (!refreshed.ok) {
      return refreshed;
    }
    return {
      ok: true,
      value: { refreshedAt: refreshed.value.last_rotated_at ?? new Date() },
    };
  }

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
    allowStaleLegacyRefresh?: boolean;
    clerkOrgId: string;
    connectionId: string;
    organisationId: string;
  },
  callbacks: RefreshAttemptCallbacks = {},
  deadline?: XeroDeadline
): Promise<Result<{ expiresAt: Date; refreshedAt: Date }, XeroOAuthError>> {
  const connection = await client.xeroConnection.findFirst({
    select: {
      disconnected_at: true,
      id: true,
      last_error_code: true,
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

  if (recordedLegacyGrantFailure(connection, input.allowStaleLegacyRefresh)) {
    return recordedGrantError();
  }
  if (
    connection.disconnected_at !== null ||
    connection.revoked_at !== null ||
    legacyStatusForRefresh(connection, input.allowStaleLegacyRefresh) !==
      "active"
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
    deadline,
    grantType: "refresh_token",
    onResponseAccepted: callbacks.onResponseAccepted,
    rateClass: { kind: "token", providerAppId: keys().XERO_CLIENT_ID ?? "" },
    refreshToken: decryptXeroToken({
      authTag: connection.refresh_token_auth_tag,
      encrypted: connection.refresh_token_encrypted,
      iv: connection.refresh_token_iv,
      keyVersion: connection.token_key_version,
    }),
  });
  if (!token.ok) {
    if (token.error.code === "refresh_token_invalid") {
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
          status: connection.status,
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
          status: connection.status,
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
      status: connection.status,
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
  allowStaleLegacyRefresh?: boolean;
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
        last_error_code: true,
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

    if (
      input.successfulAttempt !== null &&
      legacyStatusForRefresh(current, input.allowStaleLegacyRefresh) ===
        "active" &&
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
          last_error_code: current.last_error_code,
          organisation_id: input.organisationId,
          refresh_token_encrypted:
            input.successfulAttempt.previousRefreshTokenEncrypted,
          revoked_at: null,
          status: current.status,
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
      legacyStatusForRefresh(current, input.allowStaleLegacyRefresh) ===
        "active" &&
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
          last_error_code: current.last_error_code,
          organisation_id: input.organisationId,
          refresh_token_encrypted: input.loadedRefreshTokenEncrypted,
          revoked_at: null,
          status: current.status,
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
  allowStaleLegacyRefresh?: boolean;
  clerkOrgId: string;
  connectionId: string;
  forceRefresh?: boolean;
  deadline?: XeroDeadline;
  organisationId: string;
  now?: Date;
  previousAccessTokenEncrypted?: string;
}): Promise<Result<{ expiresAt: Date; refreshed: boolean }, XeroOAuthError>> {
  const ownedResult = await refreshOwnedConnection(input);
  if (ownedResult) {
    return ownedResult;
  }

  const deadline =
    input.deadline ?? createXeroDeadline(XERO_TOKEN_OPERATION_BUDGET_MS);
  const now = input.now ?? new Date();
  const connection = await database.xeroConnection.findFirst({
    select: {
      access_token_encrypted: true,
      disconnected_at: true,
      expires_at: true,
      last_error_code: true,
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
  if (recordedLegacyGrantFailure(connection, input.allowStaleLegacyRefresh)) {
    return recordedGrantError();
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
      status: legacyStatusForRefresh(connection, input.allowStaleLegacyRefresh),
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
        await boundXeroLocks(tx, deadline);
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
            disconnected_at: true,
            expires_at: true,
            last_error_code: true,
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
          recordedLegacyGrantFailure(current, input.allowStaleLegacyRefresh)
        ) {
          return recordedGrantError();
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
            status: legacyStatusForRefresh(
              current,
              input.allowStaleLegacyRefresh
            ),
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
            allowStaleLegacyRefresh: input.allowStaleLegacyRefresh,
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
          },
          deadline
        );
        if (!refreshed.ok) {
          return refreshed;
        }

        return {
          ok: true,
          value: { expiresAt: refreshed.value.expiresAt, refreshed: true },
        };
      },
      { timeout: Math.max(1, remainingMs(deadline)) }
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
): Promise<Result<XeroDisconnectReceipt, XeroOAuthError>> {
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

async function disconnectXeroOAuthConnectionWithClient(
  tx: Prisma.TransactionClient,
  input: DisconnectXeroInput
): Promise<Result<XeroDisconnectReceipt, XeroOAuthError>> {
  await boundXeroLocks(tx, createXeroDeadline(10_000));
  const initial = await loadConnectionForDisconnect(tx, input);
  if (!initial) {
    return connectionNotFoundError();
  }
  await lockDisconnectIdentity(tx, initial, input.connectionId);
  const connection = await loadConnectionForDisconnect(tx, input);
  if (!connection) {
    return connectionNotFoundError();
  }
  const tenant = connection.xero_tenant;
  if (
    (tenant?.xero_credential_owner_id ?? null) !==
      (initial.xero_tenant?.xero_credential_owner_id ?? null) ||
    (tenant?.id ?? null) !== (initial.xero_tenant?.id ?? null)
  ) {
    throw new Error("Binding changed before disconnect lock.");
  }
  if (connection.status === "disconnected") {
    const request = tenant
      ? await tx.xeroCleanupRequest.findFirst({
          orderBy: { created_at: "desc" },
          select: { id: true },
          where: {
            clerk_org_id: input.clerkOrgId,
            organisation_id: input.organisationId,
            xero_tenant_id: tenant.id,
          },
        })
      : null;
    return {
      ok: true,
      value: request
        ? await getXeroDisconnectReceipt({
            ...input,
            cleanupRequestId: request.id,
            client: tx,
          })
        : {
            cleanupRequestId: null,
            dataActionStatus: "not_requested",
            localDisabled: true,
            remoteStatus: legacyDisconnectRemoteStatus(
              connection.xero_authorisation_connection_id
            ),
          },
    };
  }
  const now = new Date();
  await finaliseLocalXeroDisconnect(tx, {
    ...input,
    now,
    xeroTenantId: tenant?.id ?? null,
  });
  if (!tenant) {
    return {
      ok: true,
      value: {
        cleanupRequestId: null,
        dataActionStatus: input.destructive ? "completed" : "not_requested",
        localDisabled: true,
        remoteStatus: legacyDisconnectRemoteStatus(
          connection.xero_authorisation_connection_id
        ),
      },
    };
  }
  return createFrozenDisconnectRequest(
    tx,
    input,
    { ...connection, xero_tenant: tenant },
    now
  );
}

function legacyDisconnectRemoteStatus(
  remoteConnectionId: string | null
): "left_in_place" | "not_applicable" {
  return remoteConnectionId ? "left_in_place" : "not_applicable";
}

async function lockDisconnectIdentity(
  tx: Prisma.TransactionClient,
  connection: NonNullable<
    Awaited<ReturnType<typeof loadConnectionForDisconnect>>
  >,
  connectionId: string
): Promise<void> {
  if (connection.xero_tenant?.xero_credential_owner_id) {
    await lockXeroOwner(tx, connection.xero_tenant.xero_credential_owner_id);
  }
  if (connection.xero_tenant) {
    await lockXeroBinding(tx, connection.xero_tenant.id);
  }
  await lockXeroConnection(tx, connectionId);
}

async function createFrozenDisconnectRequest(
  tx: Prisma.TransactionClient,
  input: DisconnectXeroInput,
  connection: NonNullable<
    Awaited<ReturnType<typeof loadConnectionForDisconnect>>
  > & {
    xero_tenant: NonNullable<
      NonNullable<
        Awaited<ReturnType<typeof loadConnectionForDisconnect>>
      >["xero_tenant"]
    >;
  },
  now: Date
): Promise<Result<XeroDisconnectReceipt, XeroOAuthError>> {
  const tenant = connection.xero_tenant;
  const providerConnections = tenant.xero_credential_owner_id
    ? await tx.xeroProviderConnection.findMany({
        where: {
          provider_app_id: tenant.provider_app_id,
          xero_credential_owner_id: tenant.xero_credential_owner_id,
          xero_tenant_id: tenant.xero_tenant_id,
        },
      })
    : [];
  const targets = freezeCleanupTargets({
    externalTenantId: tenant.xero_tenant_id,
    legacyRemoteConnectionId: connection.xero_authorisation_connection_id,
    ownerId: tenant.xero_credential_owner_id,
    providerAppId: tenant.provider_app_id,
    providerConnections,
  });
  const reportOnly = keys().XERO_REMOTE_CLEANUP_MODE !== "enabled";
  const generation = tenant.binding_generation + 1;
  const changedBinding = await tx.xeroTenant.updateMany({
    data: {
      binding_generation: { increment: 1 },
      ...(reportOnly || !targets.length
        ? {
            active_slot: null,
            retired_at: now,
            retirement_reason: "disconnected",
          }
        : {}),
    },
    where: {
      binding_generation: tenant.binding_generation,
      clerk_org_id: input.clerkOrgId,
      id: tenant.id,
      organisation_id: input.organisationId,
    },
  });
  if (changedBinding.count !== 1) {
    throw new Error("Binding generation changed during disconnect.");
  }
  const request = await tx.xeroCleanupRequest.create({
    data: {
      attempts: {
        create: targets.map((remoteId) => ({
          clerk_org_id: input.clerkOrgId,
          expected_binding_generation: generation,
          organisation_id: input.organisationId,
          outcome_reason: reportOnly ? "report_only" : null,
          provider_app_id: tenant.provider_app_id,
          remote_connection_id: remoteId,
          state: reportOnly ? "cancelled" : "pending",
        })),
      },
      binding_generation: generation,
      clerk_org_id: input.clerkOrgId,
      data_action_status: input.destructive ? "completed" : "not_requested",
      destructive: input.destructive,
      organisation_id: input.organisationId,
      requested_by_user_id: input.performedByUserId ?? "system",
      xero_tenant_id: tenant.id,
    },
    include: { attempts: true },
  });
  return {
    ok: true,
    value: {
      cleanupRequestId: request.id,
      dataActionStatus: request.data_action_status,
      localDisabled: true,
      remoteStatus: aggregateXeroDisconnectReceipt(request.attempts),
    },
  };
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
      token_key_version: true,
      xero_authorisation_connection_id: true,
      xero_tenant: {
        select: {
          binding_generation: true,
          id: true,
          provider_app_id: true,
          xero_credential_owner_id: true,
          xero_tenant_id: true,
        },
      },
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
  rateClass: XeroRateClass;
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
    rateClass: input.rateClass,
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
      expected_binding_generation: null | number;
      id: string;
      organisation_id: null | string;
      refresh_token_auth_tag: null | string;
      refresh_token_encrypted: string;
      refresh_token_iv: null | string;
      return_to: string;
      token_expires_at: Date;
      token_key_version: number;
      token_exchange_status:
        | "not_started"
        | "dispatching"
        | "exchanged"
        | "unknown"
        | null;
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
      expected_binding_generation: true,
      expires_at: true,
      id: true,
      organisation_id: true,
      refresh_token_auth_tag: true,
      refresh_token_encrypted: true,
      refresh_token_iv: true,
      return_to: true,
      token_exchange_status: true,
      token_expires_at: true,
      token_key_version: true,
    },
    where: {
      clerk_org_id: input.clerkOrgId,
      created_by_user_id: input.userId,
      expires_at: { gt: new Date() },
      id: input.sessionId,
      OR: [
        { token_exchange_status: "exchanged" },
        { token_exchange_status: null },
      ],
      status: "pending",
    },
  });
  if (!session?.token_expires_at) {
    return {
      error: {
        code: "session_not_found",
        message:
          "This Xero OAuth session has expired or is no longer available.",
      },
      ok: false,
    };
  }
  return {
    ok: true,
    value: { ...session, token_expires_at: session.token_expires_at },
  };
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

export async function exchangeToken(input: {
  code?: string;
  grantType: "authorization_code" | "refresh_token";
  deadline?: XeroDeadline;
  onResponseAccepted?: () => void;
  rateClass: XeroRateClass;
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
      deadline:
        input.deadline ?? createXeroDeadline(XERO_TOKEN_OPERATION_BUDGET_MS),
      init: {
        body,
        headers: {
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        method: "POST",
      },
      rateClass: input.rateClass,
      url: XERO_TOKEN_URL,
    });
  } catch (error) {
    return {
      error: {
        code: "network_error",
        dispatched: error instanceof XeroFetchError ? error.dispatched : true,
        message: "Xero token exchange could not reach Xero. Try again.",
        transportCode: error instanceof XeroFetchError ? error.code : undefined,
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
  if (response.status === 429) {
    return {
      code: "network_error",
      dispatched: false,
      httpStatus: 429,
      message: "Xero token exchange is temporarily unavailable. Try again.",
      retryAfterMs:
        parseRetryAfter(response.headers.get("Retry-After")) ?? undefined,
    };
  }
  if (response.status >= 500 && response.status < 600) {
    return {
      code: "network_error",
      dispatched: true,
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
  rateClass: XeroRateClass
): Promise<Result<ConnectionResponse[], XeroOAuthError>> {
  const response = await xeroFetch({
    init: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      method: "GET",
    },
    rateClass,
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
      typeof payload.sessionId !== "string" ||
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
        sessionId: payload.sessionId,
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

async function lockSelectionOwner(
  tx: Prisma.TransactionClient,
  input: {
    ownerId: string | null;
    organisationId: string | null;
    clerkOrgId: string;
  }
) {
  if (!input.ownerId) {
    return null;
  }
  await lockXeroOwner(tx, input.ownerId);
  const owner = await tx.xeroCredentialOwner.findUniqueOrThrow({
    where: { id: input.ownerId },
  });
  if (owner.usability !== "usable") {
    throw new TenantSelectionRejectedError("connection_changed");
  }
  if (input.organisationId) {
    const binding = await tx.xeroTenant.findFirst({
      select: { id: true, xero_connection_id: true },
      where: {
        clerk_org_id: input.clerkOrgId,
        organisation_id: input.organisationId,
      },
    });
    if (binding) {
      await lockXeroBinding(tx, binding.id);
      await lockXeroConnection(tx, binding.xero_connection_id);
    }
  }
  return owner;
}

async function refreshOwnedConnection(
  input: Parameters<typeof ensureFreshXeroConnection>[0]
): Promise<Result<
  { expiresAt: Date; refreshed: boolean },
  XeroOAuthError
> | null> {
  const owned = await database.xeroTenant.findFirst({
    include: { credential_owner: true, xero_connection: true },
    where: {
      clerk_org_id: input.clerkOrgId,
      organisation_id: input.organisationId,
      xero_connection_id: input.connectionId,
      xero_credential_owner_id: { not: null },
    },
  });
  if (owned?.credential_owner) {
    if (owned.credential_owner.usability !== "usable") {
      return {
        error: {
          code: "refresh_token_invalid",
          message: "Reconnect Xero to restore access.",
        },
        ok: false,
      };
    }

    if (
      owned.retired_at ||
      owned.active_slot !== 1 ||
      owned.xero_connection.disconnected_at ||
      owned.xero_connection.revoked_at ||
      !["active", "stale"].includes(owned.xero_connection.status)
    ) {
      return {
        error: {
          code: "connection_inactive",
          message: "This Xero connection is inactive.",
        },
        ok: false,
      };
    }
    if (
      !input.forceRefresh &&
      owned.credential_owner.token_expires_at.getTime() >
        (input.now ?? new Date()).getTime() + 5 * 60_000
    ) {
      return {
        ok: true,
        value: {
          expiresAt: owned.credential_owner.token_expires_at,
          refreshed: false,
        },
      };
    }
    const refreshed = await refreshXeroCredentialOwner({
      deadline:
        input.deadline ?? createXeroDeadline(XERO_TOKEN_OPERATION_BUDGET_MS),
      expectedTokenVersion: owned.credential_owner.token_version,
      ownerId: owned.credential_owner.id,
    });
    if (!refreshed.ok) {
      return refreshed;
    }
    return {
      ok: true,
      value: { expiresAt: refreshed.value.token_expires_at, refreshed: true },
    };
  }

  return null;
}

async function validateTenantSelectionBinding(
  tx: Prisma.TransactionClient,
  input: {
    clerkOrgId: string;
    organisationId: string;
    tenantId: string;
    providerAppId: string;
    expectedBindingGeneration: number | null;
  }
) {
  let existing = await tx.xeroTenant.findFirst({
    select: {
      active_slot: true,
      binding_generation: true,
      id: true,
      xero_tenant_id: true,
    },
    where: {
      clerk_org_id: input.clerkOrgId,
      organisation_id: input.organisationId,
    },
  });
  if (existing) {
    await lockXeroBinding(tx, existing.id);
    existing = await tx.xeroTenant.findFirst({
      select: {
        active_slot: true,
        binding_generation: true,
        id: true,
        xero_tenant_id: true,
      },
      where: {
        clerk_org_id: input.clerkOrgId,
        id: existing.id,
        organisation_id: input.organisationId,
      },
    });
    if (!existing) {
      throw new TenantSelectionRejectedError("connection_changed");
    }
    const now = new Date();
    await tx.xeroCleanupAttempt.updateMany({
      data: { lease_expires_at: null, lease_owner: null, state: "pending" },
      where: {
        clerk_org_id: input.clerkOrgId,
        lease_expires_at: { lte: now },
        organisation_id: input.organisationId,
        request: { xero_tenant_id: existing.id },
        state: "claimed",
      },
    });
    await tx.xeroCleanupAttempt.updateMany({
      data: {
        lease_expires_at: null,
        lease_owner: null,
        outcome_reason: "lease_expired",
        state: "unknown",
      },
      where: {
        clerk_org_id: input.clerkOrgId,
        lease_expires_at: { lte: now },
        organisation_id: input.organisationId,
        request: { xero_tenant_id: existing.id },
        state: "dispatching",
      },
    });
    const unresolved = await tx.xeroCleanupAttempt.findFirst({
      select: { id: true },
      where: {
        clerk_org_id: input.clerkOrgId,
        organisation_id: input.organisationId,
        request: { xero_tenant_id: existing.id },
        state: { in: ["claimed", "dispatching", "unknown"] },
      },
    });
    if (unresolved) {
      throw new TenantSelectionRejectedError("cleanup_unresolved");
    }
    await tx.xeroCleanupAttempt.updateMany({
      data: {
        lease_expires_at: null,
        lease_owner: null,
        outcome_reason: "superseded",
        state: "cancelled",
      },
      where: {
        clerk_org_id: input.clerkOrgId,
        organisation_id: input.organisationId,
        request: { xero_tenant_id: existing.id },
        state: "pending",
      },
    });
  }
  if (existing && existing.xero_tenant_id !== input.tenantId) {
    throw new TenantSelectionRejectedError("tenant_replacement_required");
  }
  if (
    existing &&
    input.expectedBindingGeneration !== null &&
    existing.binding_generation !== input.expectedBindingGeneration
  ) {
    throw new TenantSelectionRejectedError("connection_changed");
  }

  const reserved = await tx.xeroTenant.findFirst({
    select: { id: true },
    where: {
      active_slot: 1,
      NOT: { organisation_id: input.organisationId },
      provider_app_id: input.providerAppId,
      xero_tenant_id: input.tenantId,
    },
  });
  if (reserved) {
    throw new TenantSelectionRejectedError("tenant_binding_conflict");
  }
}

function requiresVerifiedOwner(
  exchangeStatus: string | null,
  identityVerified: boolean,
  ownerPresent: boolean,
  connectionPresent: boolean
) {
  return (
    exchangeStatus === "exchanged" &&
    !(identityVerified && ownerPresent && connectionPresent)
  );
}

function providerAssociationChanged(
  connection: {
    xero_credential_owner_id: string | null;
    xero_tenant_id: string;
  } | null,
  ownerId: string | undefined,
  tenantId: string
) {
  return (
    connection !== null &&
    (connection.xero_credential_owner_id !== ownerId ||
      connection.xero_tenant_id !== tenantId)
  );
}

export function isRecordedXeroRefreshGrantInvalid(
  code: string | null | undefined
): boolean {
  return [
    "invalid_grant",
    "refresh_invalid_grant",
    "refresh_token_invalid",
    "reauthorisation_required",
  ].includes(code ?? "");
}

interface LegacyRefreshMetadata {
  disconnected_at?: Date | null;
  last_error_code?: string | null;
  revoked_at: Date | null;
  status: string | null;
}

function recordedLegacyGrantFailure(
  connection: LegacyRefreshMetadata,
  allowStale?: boolean
): boolean {
  return Boolean(
    allowStale &&
      connection.status === "stale" &&
      !connection.revoked_at &&
      !connection.disconnected_at &&
      isRecordedXeroRefreshGrantInvalid(connection.last_error_code)
  );
}

function legacyStatusForRefresh(
  connection: LegacyRefreshMetadata,
  allowStale?: boolean
): string | null {
  if (
    allowStale &&
    connection.status === "stale" &&
    !connection.revoked_at &&
    !connection.disconnected_at &&
    !isRecordedXeroRefreshGrantInvalid(connection.last_error_code)
  ) {
    return "active";
  }
  return connection.status;
}

function recordedGrantError(): Result<never, XeroOAuthError> {
  return {
    error: {
      code: "refresh_token_invalid",
      message: "Xero access needs to be renewed.",
    },
    ok: false,
  };
}
