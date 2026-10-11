import "server-only";
import {
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { createCompany } from "@repo/availability/src/companies/create-company";
import type { Result } from "@repo/core";
import {
  systemDatabase,
  tenantDatabase,
  tenantTransaction,
  withXeroGrantLock,
} from "@repo/database";
import type {
  XeroAuthorisation,
  XeroOAuthSession,
} from "@repo/database/generated/client";
import { Prisma } from "@repo/database/generated/client";
import { checkPayrollEntityEntitlement } from "@repo/database/queries/payroll-entitlements";
import {
  claimXeroTenant,
  listXeroTenantOwnership,
} from "@repo/database/queries/xero-ownership";
import { invalidateAccountFeedCaches } from "@repo/feeds";
import { z } from "zod";
import { keys } from "../../keys";
import { createXeroDeadline, type XeroDeadline } from "../rate-limit/deadline";
import { XERO_TOKEN_OPERATION_BUDGET_MS } from "../rate-limit/limits";
import type { XeroRateClass } from "../rate-limit/shared-store";
import { type XeroFetchInput, xeroFetch } from "../rate-limit/xero-fetch";
import {
  adoptXeroAuthorisation,
  authorisationAccessToken,
  refreshXeroAuthorisation,
  TOKEN_REFRESH_BUFFER_MS,
} from "./authorisation";
import {
  verifyXeroAccessTokenIdentity,
  type XeroAccessTokenIdentity,
} from "./identity";
import { hasXeroCapability, XERO_SCOPES } from "./scopes";
import { callbackUrl, exchangeToken } from "./token";

const XERO_AUTHORISE_URL = "https://login.xero.com/identity/connect/authorize";
const XERO_CONNECTIONS_URL = "https://api.xero.com/connections";
const XERO_ORGANISATION_URL = "https://api.xero.com/api.xro/2.0/Organisation";
const STATE_MAX_AGE_MS = 10 * 60 * 1000;
const DEFAULT_XERO_RETURN_TO = "/settings/integrations/xero";

interface OAuthStatePayload {
  clerkOrgId: string;
  issuedAt: number;
  nonce: string;
  organisationId: string | null;
  returnTo: string;
  sessionId: string;
  userId: string;
}

interface ConnectionResponse {
  connectionId: string;
  isCurrentConsent?: boolean;
  tenantId: string;
  tenantName: string;
}

export interface PendingXeroSessionOrganisation {
  countryCode: string;
  id: string;
  name: string;
}

export interface PendingXeroSessionTenant {
  connectionId: string;
  isCurrentConsent?: boolean;
  state?: "available" | "already_in_account" | "unavailable";
  tenantId: string;
  tenantName: string;
}

export type XeroOAuthError = {
  dispatched?: boolean;
  transportCode?: string;
  httpStatus?: number;
  retryAfterMs?: number;
} & (
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
  | { code: "plan_limit_exceeded"; message: string }
  | { code: "unknown_error"; message: string }
);

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

  // URL normalization removes dot segments; the resulting pathname must not
  // become a protocol-relative destination when returned to the browser.
  return !new URL(value, "https://teamcalendar.local").pathname.startsWith(
    "//"
  );
}

async function resolveOrganisationForTenantSelection(input: {
  clerkOrgId: string;
  organisationId: null | string;
  tenantName: string;
  tenantPayrollRegion: "AU" | "NZ" | "UK";
}): Promise<Result<{ id: string; kind: "existing" }, XeroOAuthError>> {
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

  const organisation = await tenantDatabase(
    input.clerkOrgId
  ).organisation.findFirst({
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

async function inferPayrollRegionForTenant(input: {
  accessToken: string;
  deadline?: XeroDeadline;
  resolveBootstrapAccess?: XeroFetchInput["resolveBootstrapAccess"];
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
  let response: Response;
  try {
    response = await xeroFetch({
      deadline: input.deadline,
      init: {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${input.accessToken}`,
          "Xero-Tenant-Id": input.tenantId,
        },
        method: "GET",
      },
      rateClass: input.rateClass,
      resolveBootstrapAccess: input.resolveBootstrapAccess,
      url: XERO_ORGANISATION_URL,
    });
  } catch {
    return {
      error: {
        code: "network_error",
        message: "Failed to load Xero organisation details. Try again.",
      },
      ok: false,
    };
  }

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

  const payload = z
    .object({
      Organisations: z
        .array(z.object({ CountryCode: z.string().trim().min(1) }))
        .min(1),
    })
    .safeParse(await response.json().catch(() => null));
  if (!payload.success) {
    return {
      error: {
        code: "invalid_token_response",
        message: "Xero organisation details could not be read. Try again.",
      },
      ok: false,
    };
  }
  const countryCode =
    payload.data.Organisations[0]?.CountryCode.toUpperCase() ?? "";
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
      ? [
          {
            connectionId,
            tenantId,
            tenantName,
            ...("isCurrentConsent" in tenant &&
            typeof tenant.isCurrentConsent === "boolean"
              ? { isCurrentConsent: tenant.isCurrentConsent }
              : {}),
          },
        ]
      : [];
  });
}

// Xero requires every redirect URI to be pre-registered on the app, so the
// callback must resolve to a single fixed URL. XERO_REDIRECT_URI pins it
// explicitly to the registered production callback; otherwise it is derived
// from the API (or app) public URL. Preview deployments do not register their
// own callback: Xero connect is gated off on preview, so this only ever runs
// in production or local development.
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

// The signed state carries the caller's return path, so a failed callback can
// send the person back to where they started with a safe error code.
export function readOAuthStateReturnTo(state: string): string | null {
  const verified = verifyState(state);
  return verified.ok ? verified.value.returnTo : null;
}

function verifyState(value: string): Result<OAuthStatePayload, XeroOAuthError> {
  const clientSecret = stateSecret();
  if (!clientSecret) {
    return oauthNotConfigured();
  }

  if (value.split(".").length !== 2) {
    return invalidState();
  }
  const [encoded, signature] = value.split(".");
  if (!(encoded && signature)) {
    return invalidState();
  }

  const signingKey = deriveStateSigningKey(clientSecret);
  const expected = createHmac("sha256", signingKey)
    .update(encoded)
    .digest("base64url");
  const matches = constantTimeStringEqual(expected, signature);
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
      (payload.organisationId !== null &&
        (typeof payload.organisationId !== "string" ||
          !payload.organisationId)) ||
      typeof payload.userId !== "string" ||
      !payload.userId ||
      !isLocalApplicationPath(payload.returnTo) ||
      typeof payload.issuedAt !== "number" ||
      Date.now() - payload.issuedAt > STATE_MAX_AGE_MS
    ) {
      return invalidState();
    }
    if (payload.issuedAt > Date.now() + 30_000) {
      return invalidState();
    }
    return {
      ok: true,
      value: {
        clerkOrgId: payload.clerkOrgId,
        issuedAt: payload.issuedAt,
        nonce: payload.nonce,
        organisationId: payload.organisationId,
        returnTo: payload.returnTo,
        sessionId: payload.sessionId,
        userId: payload.userId,
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
      message: "Start connecting Xero again.",
    },
    ok: false,
  };
}

function oauthNotConfigured(): Result<never, XeroOAuthError> {
  return {
    error: {
      code: "oauth_not_configured",
      message: "Connecting Xero is unavailable. Contact support.",
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

function constantTimeStringEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}
async function loadPendingSession(input: {
  clerkOrgId: string;
  sessionId: string;
  userId: string;
}): Promise<Result<XeroOAuthSession, XeroOAuthError>> {
  const session = await systemDatabase.xeroOAuthSession.findFirst({
    where: {
      clerk_org_id: input.clerkOrgId,
      created_by_user_id: input.userId,
      expires_at: { gt: new Date() },
      id: input.sessionId,
      status: "selecting",
    },
  });
  return session?.xero_authorisation_id
    ? { ok: true, value: session }
    : {
        error: {
          code: "session_not_found",
          message: "Start connecting Xero again.",
        },
        ok: false,
      };
}
export async function getPendingXeroOAuthSession(input: {
  clerkOrgId: string;
  sessionId: string;
  userId: string;
}): Promise<
  Result<
    {
      expiresAt: Date;
      payrollEntityAllowance: {
        used: number;
        limit: number | null;
        remaining: number | null;
      };
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

  const organisations = await tenantDatabase(
    input.clerkOrgId
  ).organisation.findMany({
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
  const ownership = await listXeroTenantOwnership(
    input.clerkOrgId,
    tenants.map((tenant) => tenant.tenantId)
  );
  const allowance = await tenantTransaction(input.clerkOrgId, (tx) =>
    checkPayrollEntityEntitlement(input.clerkOrgId, tx)
  );
  if (!allowance.ok) {
    return {
      error: {
        code: "unknown_error",
        message: "Unable to load your Xero file allowance. Try again.",
      },
      ok: false,
    };
  }
  const limit = allowance.value.limit < 0 ? null : allowance.value.limit;
  const payrollEntityAllowance = {
    limit,
    remaining:
      limit === null ? null : Math.max(0, limit - allowance.value.current),
    used: allowance.value.current,
  };
  return {
    ok: true,
    value: {
      expiresAt: session.value.expires_at,
      organisations: organisations.map((organisation) => ({
        countryCode: organisation.country_code,
        id: organisation.id,
        name: organisation.name,
      })),
      payrollEntityAllowance,
      presetOrganisationId: session.value.organisation_id,
      returnTo: session.value.return_to,
      sessionId: session.value.id,
      tenants: tenants.map((tenant) => {
        let state: "already_in_account" | "unavailable" | "available" =
          "available";
        if (ownership.get(tenant.tenantId)?.status === "same_account") {
          state = "already_in_account";
        }
        if (ownership.get(tenant.tenantId)?.status === "owned_elsewhere") {
          state = "unavailable";
        }
        return { ...tenant, state };
      }),
    },
  };
}

export async function buildXeroOAuthStartUrl(input: {
  clerkOrgId: string;
  organisationId?: string | null;
  returnTo?: string;
  userId?: string | null;
}): Promise<Result<{ nonce: string; redirectUrl: string }, XeroOAuthError>> {
  if (isPreviewDeployment()) {
    return xeroConnectDisabled();
  }
  const secret = keys().XERO_CLIENT_SECRET,
    clientId = keys().XERO_CLIENT_ID;
  if (!(secret && clientId)) {
    return oauthNotConfigured();
  }
  if (!(input.userId && input.clerkOrgId)) {
    return invalidState();
  }
  if (input.returnTo !== undefined && !isLocalApplicationPath(input.returnTo)) {
    return invalidState();
  }
  if (
    input.organisationId &&
    !(await tenantDatabase(input.clerkOrgId).organisation.findFirst({
      where: {
        archived_at: null,
        clerk_org_id: input.clerkOrgId,
        id: input.organisationId,
      },
    }))
  ) {
    return {
      error: {
        code: "organisation_not_found",
        message: "Organisation not found.",
      },
      ok: false,
    };
  }
  const nonce = randomBytes(32).toString("base64url");
  const session = await systemDatabase.xeroOAuthSession.create({
    data: {
      clerk_org_id: input.clerkOrgId,
      created_by_user_id: input.userId ?? null,
      expires_at: new Date(Date.now() + STATE_MAX_AGE_MS),
      nonce_hash: createHash("sha256").update(nonce).digest("hex"),
      organisation_id: input.organisationId ?? null,
      requested_scopes: XERO_SCOPES.split(" "),
      return_to: input.returnTo ?? DEFAULT_XERO_RETURN_TO,
      status: "pending",
    },
  });
  const state = signState(
    {
      clerkOrgId: input.clerkOrgId,
      issuedAt: Date.now(),
      nonce,
      organisationId: input.organisationId ?? null,
      returnTo: session.return_to,
      sessionId: session.id,
      userId: input.userId,
    },
    secret
  );
  await systemDatabase.xeroOAuthSession.updateMany({
    data: { state_hash: createHash("sha256").update(state).digest("hex") },
    where: {
      clerk_org_id: input.clerkOrgId,
      id: session.id,
      organisation_id: session.organisation_id,
    },
  });
  const url = new URL(XERO_AUTHORISE_URL);
  for (const [key, value] of Object.entries({
    client_id: clientId,
    redirect_uri: callbackUrl(),
    response_type: "code",
    scope: XERO_SCOPES,
    state,
  })) {
    url.searchParams.set(key, value);
  }
  return { ok: true, value: { nonce, redirectUrl: url.toString() } };
}
async function prepareOAuthTenantSelection(
  token: {
    accessToken: string;
    refreshToken: string;
    scopes?: string;
    identity: XeroAccessTokenIdentity;
  },
  signed: OAuthStatePayload,
  scope: {
    clerk_org_id: string;
    created_by_user_id: string | null;
    organisation_id: string | null;
    id: string;
  },
  deadline: XeroDeadline,
  tx: Prisma.TransactionClient
): Promise<Result<{ tenants: ConnectionResponse[] }, XeroOAuthError>> {
  const rateClass = {
    kind: "user_inventory" as const,
    providerAppId: keys().XERO_CLIENT_ID ?? "",
  };
  const inventory = await fetchConnections(
    token.accessToken,
    rateClass,
    undefined,
    deadline
  );
  const currentConsent =
    inventory.ok && token.identity.authEventId
      ? await fetchConnections(
          token.accessToken,
          rateClass,
          token.identity.authEventId,
          deadline
        )
      : inventory;
  // A new grant supersedes the old app/user grant. Preserve it for existing
  // consumers even if inventory is temporarily unavailable.
  const inventoryError = inventory.ok ? null : inventory;
  const consentError = currentConsent.ok ? null : currentConsent;
  const failedInventory = inventoryError ?? consentError;
  if (
    failedInventory &&
    !(await tx.xeroAuthorisation.findUnique({
      where: {
        provider_app_id_xero_user_id: {
          provider_app_id: rateClass.providerAppId,
          xero_user_id: token.identity.xeroUserId,
        },
      },
    }))
  ) {
    return failedInventory;
  }
  const adopted = await adoptXeroAuthorisation(
    {
      accessToken: token.accessToken,
      identity: token.identity,
      refreshToken: token.refreshToken,
      scopes: token.scopes,
    },
    tx
  );
  if (!adopted.ok) {
    return adopted;
  }
  if (failedInventory) {
    return failedInventory;
  }
  if (!(inventory.ok && currentConsent.ok)) {
    return invalidState();
  }
  const existing = signed.organisationId
    ? await tx.xeroConnection.findFirst({
        where: {
          clerk_org_id: signed.clerkOrgId,
          organisation_id: signed.organisationId,
        },
      })
    : null;
  const eligible = existing
    ? inventory.value.filter(
        (tenant) => tenant.tenantId === existing.xero_tenant_id
      )
    : inventory.value;
  const tenants = eligible
    .map((tenant) =>
      token.identity.authEventId
        ? {
            ...tenant,
            isCurrentConsent: currentConsent.value.some(
              (consented) =>
                consented.connectionId === tenant.connectionId &&
                consented.tenantId === tenant.tenantId
            ),
          }
        : tenant
    )
    .sort(
      (left, right) =>
        Number(right.isCurrentConsent ?? false) -
        Number(left.isCurrentConsent ?? false)
    );
  const sessionUpdate = await tx.xeroOAuthSession.updateMany({
    data: {
      available_tenants_json: {
        authEventId: token.identity.authEventId,
        tenants: tenants.map((tenant) => ({
          connectionId: tenant.connectionId,
          tenantId: tenant.tenantId,
          tenantName: tenant.tenantName,
          ...(tenant.isCurrentConsent === undefined
            ? {}
            : { isCurrentConsent: tenant.isCurrentConsent }),
        })),
      },
      status: "selecting",
      xero_authorisation_id: adopted.value.id,
    },
    where: { ...scope, status: "exchanging" },
  });
  if (sessionUpdate.count !== 1) {
    throw new Error("OAuth session changed");
  }
  return {
    ok: true as const,
    value: { tenants },
  };
}

export async function completeXeroOAuth(input: {
  authenticatedClerkOrgId?: string | null;
  authenticatedUserId?: string | null;
  code: string;
  nonce: string | null;
  state: string;
}): Promise<
  Result<
    {
      redirectTo: string;
      sessionId: string;
      connected?: { connectionId: string; organisationId: string };
    },
    XeroOAuthError
  >
> {
  const state = verifyState(input.state);
  if (!state.ok) {
    return state;
  }
  const signed = state.value;
  if (
    !(
      input.nonce &&
      input.authenticatedClerkOrgId &&
      input.authenticatedUserId &&
      constantTimeStringEqual(input.nonce, signed.nonce)
    ) ||
    input.authenticatedClerkOrgId !== signed.clerkOrgId ||
    input.authenticatedUserId !== signed.userId
  ) {
    return invalidState();
  }
  const scope = {
    clerk_org_id: signed.clerkOrgId,
    created_by_user_id: signed.userId,
    id: signed.sessionId,
    organisation_id: signed.organisationId,
  };
  const claimed = await systemDatabase.xeroOAuthSession.updateMany({
    data: { callback_claimed_at: new Date(), status: "exchanging" },
    where: {
      ...scope,
      expires_at: { gt: new Date() },
      nonce_hash: createHash("sha256").update(input.nonce).digest("hex"),
      return_to: signed.returnTo,
      state_hash: createHash("sha256").update(input.state).digest("hex"),
      status: "pending",
    },
  });
  if (claimed.count !== 1) {
    return invalidState();
  }
  try {
    const deadline = createXeroDeadline(XERO_TOKEN_OPERATION_BUDGET_MS);
    const grant = await withXeroGrantLock(
      {
        deadlineAt: deadline.expiresAtMs,
        mode: "code",
        providerAppId: keys().XERO_CLIENT_ID ?? "",
      },
      async (tx) => {
        const token = await exchangeToken({
          code: input.code,
          deadline,
          grantType: "authorization_code",
          rateClass: {
            kind: "token",
            providerAppId: keys().XERO_CLIENT_ID ?? "",
          },
        });
        if (!token.ok) {
          return token;
        }
        const verified = await verifyXeroAccessTokenIdentity(
          token.value.access_token
        );
        if (!verified.ok) {
          return {
            error: {
              code: "invalid_token_response" as const,
              message: verified.error.message,
            },
            ok: false as const,
          };
        }
        return prepareOAuthTenantSelection(
          {
            accessToken: token.value.access_token,
            identity: verified.value,
            refreshToken: token.value.refresh_token,
            scopes: token.value.scope,
          },
          signed,
          scope,
          deadline,
          tx
        );
      }
    );
    if (!grant.ok) {
      await closeOAuthSession(scope, "cancelled");
      return grant;
    }
    if (grant.value.tenants.length === 0) {
      await closeOAuthSession(scope, "cancelled");
      return {
        error: {
          code: "tenant_not_found",
          message:
            "No authorised Xero payroll organisation is available. Start again.",
        },
        ok: false,
      };
    }
    const [onlyTenant] = grant.value.tenants;
    if (
      grant.value.tenants.length === 1 &&
      onlyTenant &&
      signed.organisationId
    ) {
      const selected = await completeXeroTenantSelection({
        clerkOrgId: signed.clerkOrgId,
        organisationId: signed.organisationId,
        sessionId: signed.sessionId,
        tenantId: onlyTenant.tenantId,
        userId: input.authenticatedUserId,
      });
      if (!selected.ok) {
        return selected;
      }
      const redirect = new URL(
        selected.value.returnTo,
        "https://teamcalendar.local"
      );
      redirect.searchParams.set("org", selected.value.organisationId);
      return {
        ok: true,
        value: {
          connected: {
            connectionId: selected.value.connectionId,
            organisationId: selected.value.organisationId,
          },
          redirectTo: redirect.pathname + redirect.search + redirect.hash,
          sessionId: signed.sessionId,
        },
      };
    }
    return {
      ok: true,
      value: {
        redirectTo: `/settings/integrations/xero/connect?session=${signed.sessionId}`,
        sessionId: signed.sessionId,
      },
    };
  } catch {
    await closeOAuthSession(scope, "cancelled");
    return {
      error: {
        code: "unknown_error",
        message: "The Xero connection could not be saved. Start again.",
      },
      ok: false,
    };
  }
}
export async function cancelXeroOAuth(input: {
  authenticatedClerkOrgId?: string | null;
  authenticatedUserId?: string | null;
  nonce: string | null;
  state: string;
}): Promise<Result<{ redirectTo: string; sessionId: string }, XeroOAuthError>> {
  const state = verifyState(input.state);
  if (!state.ok) {
    return state;
  }
  const signed = state.value;
  if (
    !(
      input.nonce &&
      input.authenticatedClerkOrgId &&
      input.authenticatedUserId &&
      constantTimeStringEqual(input.nonce, signed.nonce)
    ) ||
    input.authenticatedClerkOrgId !== signed.clerkOrgId ||
    input.authenticatedUserId !== signed.userId
  ) {
    return invalidState();
  }
  const cancelled = await systemDatabase.xeroOAuthSession.updateMany({
    data: {
      available_tenants_json: Prisma.DbNull,
      nonce_hash: null,
      state_hash: null,
      status: "cancelled",
      xero_authorisation_id: null,
    },
    where: {
      clerk_org_id: signed.clerkOrgId,
      created_by_user_id: signed.userId,
      expires_at: { gt: new Date() },
      id: signed.sessionId,
      nonce_hash: createHash("sha256").update(input.nonce).digest("hex"),
      organisation_id: signed.organisationId,
      state_hash: createHash("sha256").update(input.state).digest("hex"),
      status: "pending",
    },
  });
  if (!cancelled.count) {
    return invalidState();
  }
  const redirect = new URL(signed.returnTo, "https://teamcalendar.local");
  redirect.searchParams.set("xero", "cancelled");
  return {
    ok: true,
    value: {
      redirectTo: redirect.pathname + redirect.search + redirect.hash,
      sessionId: signed.sessionId,
    },
  };
}
async function closeOAuthSession(
  scope: {
    clerk_org_id: string;
    id: string;
    created_by_user_id: string | null;
    organisation_id: string | null;
  },
  status: "cancelled" | "completed"
) {
  await systemDatabase.xeroOAuthSession.updateMany({
    data: {
      available_tenants_json: Prisma.DbNull,
      nonce_hash: null,
      state_hash: null,
      status,
    },
    where: scope,
  });
}
async function fetchConnections(
  accessToken: string,
  rateClass: XeroRateClass,
  authEventId?: string,
  deadline?: XeroDeadline,
  resolveBootstrapAccess?: XeroFetchInput["resolveBootstrapAccess"]
): Promise<Result<ConnectionResponse[], XeroOAuthError>> {
  try {
    const url = new URL(XERO_CONNECTIONS_URL);
    if (authEventId) {
      url.searchParams.set("authEventId", authEventId);
    }
    const response = await xeroFetch({
      deadline,
      init: {
        headers: { Authorization: `Bearer ${accessToken}` },
        method: "GET",
      },
      rateClass,
      resolveBootstrapAccess,
      url: url.toString(),
    });
    if (!response.ok) {
      return {
        error: {
          code: "network_error",
          message: "Failed to load Xero files. Try again.",
        },
        ok: false,
      };
    }
    const rows = z
      .array(
        z.object({
          id: z.string().trim().min(1),
          tenantId: z.string().trim().min(1),
          tenantName: z.string().trim().min(1),
          tenantType: z.string().trim().min(1),
        })
      )
      .safeParse(await response.json());
    if (!rows.success) {
      return {
        error: {
          code: "invalid_token_response",
          message: "Xero file inventory was invalid.",
        },
        ok: false,
      };
    }
    return {
      ok: true,
      value: rows.data
        .filter((row) => row.tenantType === "ORGANISATION")
        .map((row) => ({
          connectionId: row.id,
          tenantId: row.tenantId,
          tenantName: row.tenantName,
        })),
    };
  } catch {
    return {
      error: {
        code: "network_error",
        message: "Failed to load Xero files. Try again.",
      },
      ok: false,
    };
  }
}

function tenantSelectionFailureCode(
  error: unknown
): "tenant_replacement_required" | "tenant_binding_conflict" {
  return error instanceof Error &&
    error.message === "tenant_replacement_required"
    ? "tenant_replacement_required"
    : "tenant_binding_conflict";
}

async function completeSingleXeroTenantSelection(input: {
  clerkOrgId: string;
  organisationId?: string | null;
  sessionId: string;
  tenantId: string;
  userId: string;
}): Promise<
  Result<
    { connectionId: string; organisationId: string; returnTo: string },
    XeroOAuthError
  >
> {
  const loaded = await loadPendingSession(input);
  if (!loaded.ok) {
    return loaded;
  }
  const session = loaded.value;
  if (
    input.organisationId &&
    input.organisationId !== session.organisation_id
  ) {
    return invalidState();
  }

  const candidate = readAvailableTenants(session.available_tenants_json).find(
    (t) => t.tenantId === input.tenantId
  );
  if (!candidate) {
    return {
      error: {
        code: "tenant_not_found",
        message: "The selected Xero file is no longer available.",
      },
      ok: false,
    };
  }
  const deadline = createXeroDeadline(XERO_TOKEN_OPERATION_BUDGET_MS);
  // A pending session establishes authority before an Organisation has a connection.
  // Reload canonical credentials for each bootstrap request; refresh remains centralised.
  async function selectionAccess(): Promise<
    Result<{ grant: XeroAuthorisation; accessToken: string }, XeroOAuthError>
  > {
    let grant = await systemDatabase.xeroAuthorisation.findUnique({
      where: { id: session.xero_authorisation_id ?? "" },
    });
    if (!grant) {
      return {
        error: { code: "session_not_found", message: "Start again." },
        ok: false,
      };
    }
    if (grant.status !== "active") {
      return {
        error: {
          code: "connection_inactive",
          message: "Start connecting Xero again.",
        },
        ok: false,
      };
    }
    if (
      grant.access_token_expires_at.getTime() <=
      Date.now() + TOKEN_REFRESH_BUFFER_MS
    ) {
      const refreshed = await refreshXeroAuthorisation({
        authorisationId: grant.id,
        deadline,
      });
      if (!refreshed.ok) {
        return refreshed;
      }
    }
    const currentSession = await loadPendingSession(input);
    if (!currentSession.ok) {
      return currentSession;
    }
    if (
      currentSession.value.xero_authorisation_id !==
        session.xero_authorisation_id ||
      currentSession.value.organisation_id !== session.organisation_id
    ) {
      return invalidState();
    }
    grant = await systemDatabase.xeroAuthorisation.findUnique({
      where: { id: grant.id },
    });
    if (
      grant?.status !== "active" ||
      grant.access_token_expires_at.getTime() <= Date.now() ||
      !hasXeroCapability(grant.granted_scopes, "accounting.settings.read")
    ) {
      return {
        error: {
          code: "connection_inactive",
          message: "Start connecting Xero again.",
        },
        ok: false,
      };
    }
    let accessToken: string;
    try {
      accessToken = authorisationAccessToken(grant);
    } catch {
      return {
        error: {
          code: "invalid_token_response",
          message: "Start connecting Xero again.",
        },
        ok: false,
      };
    }
    return { ok: true, value: { accessToken, grant } };
  }
  const selectedGrant = await systemDatabase.xeroAuthorisation.findUnique({
    where: { id: session.xero_authorisation_id ?? "" },
  });
  if (!selectedGrant) {
    return {
      error: { code: "session_not_found", message: "Start again." },
      ok: false,
    };
  }
  let selectionError: XeroOAuthError | undefined;
  const resolveBootstrapAccess = async () => {
    const resolved = await selectionAccess();
    selectionError = resolved.ok ? undefined : resolved.error;
    return resolved;
  };
  const targetOrganisationId =
    session.organisation_id ?? input.organisationId ?? null;
  const connectionSnapshot = targetOrganisationId
    ? await tenantDatabase(input.clerkOrgId).xeroConnection.findFirst({
        select: {
          id: true,
          remote_connection_id: true,
          status: true,
          updated_at: true,
          xero_authorisation_id: true,
          xero_tenant_id: true,
        },
        where: {
          clerk_org_id: input.clerkOrgId,
          organisation_id: targetOrganisationId,
          released_at: null,
        },
      })
    : null;
  const connections = await fetchConnections(
    "",
    {
      kind: "user_inventory",
      providerAppId: selectedGrant.provider_app_id,
    },
    undefined,
    deadline,
    resolveBootstrapAccess
  );
  if (!connections.ok) {
    return selectionError ? { error: selectionError, ok: false } : connections;
  }
  const selected = connections.value.find(
    (t) =>
      t.tenantId === candidate.tenantId &&
      t.connectionId === candidate.connectionId
  );
  if (!selected) {
    return {
      error: {
        code: "tenant_not_found",
        message: "The selected Xero file is no longer available.",
      },
      ok: false,
    };
  }
  const region = await inferPayrollRegionForTenant({
    accessToken: "",
    deadline,
    rateClass: {
      kind: "tenant",
      providerAppId: selectedGrant.provider_app_id,
      xeroTenantId: selected.tenantId,
    },
    resolveBootstrapAccess,
    tenantId: selected.tenantId,
  });
  if (!region.ok) {
    return selectionError ? { error: selectionError, ok: false } : region;
  }
  if (region.value.payrollRegion !== "AU") {
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
    organisationId: session.organisation_id ?? input.organisationId ?? null,
    tenantName: selected.tenantName,
    tenantPayrollRegion: region.value.payrollRegion,
  });
  if (!organisation.ok) {
    return organisation;
  }
  try {
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Single-file compatibility preserves the existing atomic session and connection identity fences.
    const connection = await systemDatabase.$transaction(async (tx) => {
      const claimed = await tx.xeroOAuthSession.updateMany({
        data: {
          available_tenants_json: Prisma.DbNull,
          nonce_hash: null,
          selected_payroll_region: region.value.payrollRegion,
          selected_tenant_id: selected.tenantId,
          selected_tenant_name: selected.tenantName,
          state_hash: null,
          status: "completed",
          // Retain a replaced grant for the existing atomic session purge.
          xero_authorisation_id:
            connectionSnapshot?.xero_authorisation_id === selectedGrant.id
              ? null
              : (connectionSnapshot?.xero_authorisation_id ?? null),
        },
        where: {
          clerk_org_id: input.clerkOrgId,
          created_by_user_id: input.userId,
          expires_at: { gt: new Date() },
          id: session.id,
          organisation_id: session.organisation_id,
          status: "selecting",
          xero_authorisation_id: selectedGrant.id,
        },
      });
      if (!claimed.count) {
        throw new Error("session_not_found");
      }
      const ownership = await claimXeroTenant(
        tx,
        { clerkOrgId: input.clerkOrgId },
        selected.tenantId
      );
      if (
        ownership.status === "owned_elsewhere" ||
        (ownership.status === "same_account" &&
          ownership.organisationId !== organisation.value.id)
      ) {
        throw new Error("tenant_binding_conflict");
      }
      const organisationId = organisation.value.id;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`xero-organisation:${organisationId}`}, 0))::text`;
      const scope = {
        clerk_org_id: input.clerkOrgId,
        organisation_id: organisationId,
      };
      await tx.$queryRaw`SELECT id FROM xero_connections WHERE clerk_org_id = ${input.clerkOrgId} AND organisation_id = ${organisationId}::uuid FOR UPDATE`;
      const current = await tx.xeroConnection.findFirst({ where: scope });
      if (
        Boolean(current) !== Boolean(connectionSnapshot) ||
        (current &&
          connectionSnapshot &&
          (current.id !== connectionSnapshot.id ||
            current.updated_at.getTime() !==
              connectionSnapshot.updated_at.getTime() ||
            current.status !== connectionSnapshot.status ||
            current.xero_authorisation_id !==
              connectionSnapshot.xero_authorisation_id ||
            current.remote_connection_id !==
              connectionSnapshot.remote_connection_id))
      ) {
        throw new Error("connection_changed");
      }
      // Reconnect may change the OAuth principal, never the Organisation's Xero file.
      if (current?.released_at) {
        throw new Error("tenant_binding_conflict");
      }
      if (current && current.xero_tenant_id !== selected.tenantId) {
        throw new Error("tenant_replacement_required");
      }
      const data = {
        balance_next_person_id: null,
        balance_sweep_failed: false,
        disconnected_at: null,
        initial_sync_completed_at: null,
        initial_sync_requested_at: new Date(),
        last_connected_at: new Date(),
        last_error_code: null,
        last_error_message: null,
        leave_next_person_id: null,
        leave_sweep_failed: false,
        payroll_region: region.value.payrollRegion,
        remote_connection_id: selected.connectionId,
        status: "active" as const,
        sync_paused_at:
          current?.status === "disconnected"
            ? null
            : (current?.sync_paused_at ?? null),
        tenant_name: selected.tenantName,
        tenant_type: "ORGANISATION",
        xero_authorisation_id: selectedGrant.id,
      };
      const saved = current
        ? await tx.xeroConnection.update({
            data,
            where: { ...scope, id: current.id },
          })
        : await tx.xeroConnection.create({
            data: { ...scope, ...data, xero_tenant_id: selected.tenantId },
          });
      await tx.auditEvent.create({
        data: {
          ...scope,
          action: "xero_connected",
          actor_user_id: input.userId,
          resource_id: saved.id,
          resource_type: "xero_connection",
        },
      });
      return saved;
    });
    return {
      ok: true,
      value: {
        connectionId: connection.id,
        organisationId: connection.organisation_id,
        returnTo: isLocalApplicationPath(session.return_to)
          ? session.return_to
          : DEFAULT_XERO_RETURN_TO,
      },
    };
  } catch (error) {
    const code = tenantSelectionFailureCode(error);
    return {
      error: {
        code,
        message:
          "This Xero file cannot be connected to the selected organisation.",
      },
      ok: false,
    };
  }
}
export async function purgeClosedXeroOAuthSessions(
  now = new Date()
): Promise<void> {
  const closed: Prisma.XeroOAuthSessionWhereInput = {
    OR: [
      { expires_at: { lte: now } },
      { status: { in: ["cancelled", "completed"] } },
    ],
  };
  const sessions = await systemDatabase.xeroOAuthSession.findMany({
    select: {
      authorisation: {
        select: { id: true, provider_app_id: true, xero_user_id: true },
      },
    },
    where: closed,
  });
  const candidates = sessions.flatMap((session) =>
    session.authorisation ? [session.authorisation] : []
  );
  for (const grant of new Map(
    candidates.map((candidate) => [candidate.id, candidate])
  ).values()) {
    await withXeroGrantLock(
      {
        deadlineAt: Date.now() + 15_000,
        mode: "refresh",
        providerAppId: grant.provider_app_id,
        xeroUserId: grant.xero_user_id,
      },
      async (tx) => {
        await tx.xeroOAuthSession.deleteMany({
          where: { ...closed, xero_authorisation_id: grant.id },
        });
        await tx.xeroAuthorisation.deleteMany({
          where: {
            connections: { none: {} },
            id: grant.id,
            sessions: { none: {} },
          },
        });
      }
    );
  }
  await systemDatabase.xeroOAuthSession.deleteMany({
    where: { ...closed, xero_authorisation_id: null },
  });
}

export type XeroTenantSelectionOutcome =
  | {
      tenantId: string;
      ok: true;
      connectionId: string;
      organisationId: string;
      action: "connected" | "reconnected";
    }
  | { tenantId: string; ok: false; error: XeroOAuthError };
export interface XeroMultiTenantSelectionResult {
  outcomes: XeroTenantSelectionOutcome[];
  returnTo: string;
}
interface SelectionScope {
  clerkOrgId: string;
  organisationId?: string | null;
  sessionId: string;
  userId: string;
}
export function completeXeroTenantSelection(
  input: SelectionScope & { tenantIds: string[] }
): Promise<Result<XeroMultiTenantSelectionResult, XeroOAuthError>>;
export function completeXeroTenantSelection(
  input: SelectionScope & { tenantId: string }
): Promise<
  Result<
    { connectionId: string; organisationId: string; returnTo: string },
    XeroOAuthError
  >
>;
export function completeXeroTenantSelection(
  input: SelectionScope & ({ tenantIds: string[] } | { tenantId: string })
): Promise<
  Result<
    | XeroMultiTenantSelectionResult
    | { connectionId: string; organisationId: string; returnTo: string },
    XeroOAuthError
  >
> {
  return "tenantIds" in input
    ? completeMultiXeroTenantSelection(input)
    : completeSingleXeroTenantSelection(input);
}

const SelectionOutcomeSchema = z.discriminatedUnion("ok", [
  z.object({
    action: z.enum(["connected", "reconnected"]),
    connectionId: z.string(),
    ok: z.literal(true),
    organisationId: z.string(),
    tenantId: z.string(),
  }),
  z.object({
    error: z.object({ code: z.string(), message: z.string() }),
    ok: z.literal(false),
    tenantId: z.string(),
  }),
]);
function readSelectionOutcomes(value: unknown): XeroTenantSelectionOutcome[] {
  const parsed = z
    .object({ outcomes: z.array(SelectionOutcomeSchema) })
    .safeParse(value);
  // Stored errors originate from this service's validated business errors.
  return parsed.success
    ? (parsed.data.outcomes as XeroTenantSelectionOutcome[])
    : [];
}
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Each selected file has an isolated result while the session and canonical grant retain one inventory read.
async function completeMultiXeroTenantSelection(
  input: SelectionScope & { tenantIds: string[] }
): Promise<Result<XeroMultiTenantSelectionResult, XeroOAuthError>> {
  const ids = z
    .array(z.string().min(1))
    .min(1)
    .max(100)
    .safeParse(input.tenantIds);
  if (
    !ids.success ||
    new Set(input.tenantIds).size !== input.tenantIds.length
  ) {
    return invalidState();
  }
  const session = await systemDatabase.xeroOAuthSession.findFirst({
    where: {
      clerk_org_id: input.clerkOrgId,
      created_by_user_id: input.userId,
      expires_at: { gt: new Date() },
      id: input.sessionId,
      status: { in: ["selecting", "completed"] },
    },
  });
  if (
    !session ||
    (input.organisationId &&
      input.organisationId !== session.organisation_id) ||
    (session.organisation_id && ids.data.length !== 1)
  ) {
    return invalidState();
  }
  const returnTo = isLocalApplicationPath(session.return_to)
    ? session.return_to
    : DEFAULT_XERO_RETURN_TO;
  const stored = readSelectionOutcomes(session.available_tenants_json);
  if (session.status === "completed") {
    const outcomes = ids.data.map((id) =>
      stored.find((outcome) => outcome.tenantId === id)
    );
    if (outcomes.some((outcome) => outcome === undefined)) {
      return invalidState();
    }
    return {
      ok: true,
      value: {
        outcomes: outcomes.filter(
          (outcome): outcome is XeroTenantSelectionOutcome =>
            outcome !== undefined
        ),
        returnTo,
      },
    };
  }
  const candidates = readAvailableTenants(session.available_tenants_json);
  if (
    ids.data.some(
      (id) => !candidates.some((candidate) => candidate.tenantId === id)
    )
  ) {
    return {
      error: {
        code: "tenant_not_found",
        message: "The selected Xero file is no longer available.",
      },
      ok: false,
    };
  }
  const grant = await systemDatabase.xeroAuthorisation.findUnique({
    where: { id: session.xero_authorisation_id ?? "" },
  });
  if (grant?.status !== "active") {
    return {
      error: {
        code: "connection_inactive",
        message: "Start connecting Xero again.",
      },
      ok: false,
    };
  }
  const deadline = createXeroDeadline(XERO_TOKEN_OPERATION_BUDGET_MS);
  const grantId = grant.id;
  const resolveBootstrapAccess = async (): Promise<
    Result<{ accessToken: string; grant: XeroAuthorisation }, XeroOAuthError>
  > => {
    const activeSession = await loadPendingSession(input);
    if (
      !activeSession.ok ||
      activeSession.value.xero_authorisation_id !== grantId
    ) {
      return invalidState();
    }
    const current = await systemDatabase.xeroAuthorisation.findUnique({
      where: { id: grantId },
    });
    if (
      current?.status !== "active" ||
      !hasXeroCapability(current.granted_scopes, "accounting.settings.read")
    ) {
      return {
        error: {
          code: "connection_inactive",
          message: "Start connecting Xero again.",
        },
        ok: false,
      };
    }
    const fresh =
      current.access_token_expires_at.getTime() <=
      Date.now() + TOKEN_REFRESH_BUFFER_MS
        ? await refreshXeroAuthorisation({ authorisationId: grantId, deadline })
        : { ok: true as const, value: current };
    if (!fresh.ok) {
      return fresh;
    }
    return {
      ok: true,
      value: {
        accessToken: authorisationAccessToken(fresh.value),
        grant: fresh.value,
      },
    };
  };
  const ownershipSnapshots = await listXeroTenantOwnership(
    input.clerkOrgId,
    ids.data
  );
  const connectionSnapshots = await tenantDatabase(
    input.clerkOrgId
  ).xeroConnection.findMany({
    where: {
      clerk_org_id: input.clerkOrgId,
      OR: [
        { xero_tenant_id: { in: ids.data } },
        ...(session.organisation_id
          ? [{ organisation_id: session.organisation_id }]
          : []),
      ],
      released_at: null,
    },
  });
  const obsoleteGrants = new Set<string>();
  const inventory = await fetchConnections(
    "",
    { kind: "user_inventory", providerAppId: grant.provider_app_id },
    undefined,
    deadline,
    resolveBootstrapAccess
  );
  if (!inventory.ok) {
    return inventory;
  }
  const outcomes: XeroTenantSelectionOutcome[] = [];
  for (const tenantId of ids.data) {
    const prior = stored.find((item) => item.tenantId === tenantId);
    if (prior) {
      outcomes.push(prior);
      continue;
    }
    const candidate = candidates.find((tenant) => tenant.tenantId === tenantId);
    const selected = inventory.value.find(
      (tenant) =>
        tenant.tenantId === tenantId &&
        tenant.connectionId === candidate?.connectionId
    );
    let outcome: XeroTenantSelectionOutcome;
    if (selected) {
      const region = await inferPayrollRegionForTenant({
        accessToken: "",
        deadline,
        rateClass: {
          kind: "tenant",
          providerAppId: grant.provider_app_id,
          xeroTenantId: tenantId,
        },
        resolveBootstrapAccess,
        tenantId,
      });
      if (!region.ok || region.value.payrollRegion !== "AU") {
        outcome = {
          error: region.ok
            ? {
                code: "invalid_country",
                message:
                  "Team Calendar currently supports Australian Xero Payroll files only.",
              }
            : region.error,
          ok: false,
          tenantId,
        };
      } else {
        try {
          // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Ownership, quota, company creation and session progress are one atomic OAuth lifecycle transaction.
          outcome = await systemDatabase.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM xero_oauth_sessions WHERE id = ${session.id}::uuid AND clerk_org_id = ${input.clerkOrgId} FOR UPDATE`;
            const activeSession = await tx.xeroOAuthSession.findFirst({
              where: {
                clerk_org_id: input.clerkOrgId,
                created_by_user_id: input.userId,
                expires_at: { gt: new Date() },
                id: session.id,
                status: "selecting",
                xero_authorisation_id: grantId,
              },
            });
            if (!activeSession) {
              throw new Error("session_not_found");
            }
            const already = readSelectionOutcomes(
              activeSession.available_tenants_json
            ).find((item) => item.tenantId === tenantId);
            if (already) {
              return already;
            }
            const ownership = await claimXeroTenant(
              tx,
              { clerkOrgId: input.clerkOrgId },
              tenantId
            );
            if (ownership.status === "owned_elsewhere") {
              throw new Error("tenant_binding_conflict");
            }
            const ownershipSnapshot = ownershipSnapshots.get(tenantId);
            if (ownership.status !== (ownershipSnapshot?.status ?? "unowned")) {
              throw new Error("connection_changed");
            }
            const tenantSnapshot = connectionSnapshots.find(
              (binding) => binding.xero_tenant_id === tenantId
            );
            if (ownership.status === "same_account") {
              if (
                ownershipSnapshot?.status !== "same_account" ||
                ownershipSnapshot.connectionId !== ownership.connectionId ||
                ownershipSnapshot.organisationId !== ownership.organisationId ||
                !tenantSnapshot ||
                tenantSnapshot.id !== ownership.connectionId ||
                tenantSnapshot.organisation_id !== ownership.organisationId
              ) {
                throw new Error("connection_changed");
              }
              // Lock the original binding before any quota check or company creation.
              // Remove uses this row lock too, so its release must be observed here.
              await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`xero-organisation:${tenantSnapshot.organisation_id}`}, 0))::text`;
              await tx.$queryRaw`SELECT id FROM xero_connections WHERE id = ${tenantSnapshot.id}::uuid AND clerk_org_id = ${input.clerkOrgId} AND organisation_id = ${tenantSnapshot.organisation_id}::uuid FOR UPDATE`;
              const original = await tx.xeroConnection.findFirst({
                where: {
                  clerk_org_id: input.clerkOrgId,
                  id: tenantSnapshot.id,
                  organisation_id: tenantSnapshot.organisation_id,
                },
              });
              if (
                !original ||
                original.released_at ||
                original.updated_at.getTime() !==
                  tenantSnapshot.updated_at.getTime() ||
                original.status !== tenantSnapshot.status ||
                original.xero_authorisation_id !==
                  tenantSnapshot.xero_authorisation_id ||
                original.remote_connection_id !==
                  tenantSnapshot.remote_connection_id ||
                original.xero_tenant_id !== tenantId
              ) {
                throw new Error("connection_changed");
              }
            } else if (tenantSnapshot) {
              throw new Error("connection_changed");
            }
            let organisationId = session.organisation_id;
            if (ownership.status === "same_account") {
              if (
                organisationId &&
                organisationId !== ownership.organisationId
              ) {
                throw new Error("tenant_binding_conflict");
              }
              ({ organisationId } = ownership);
            }
            if (organisationId) {
              const organisation = await tx.organisation.findFirst({
                where: {
                  archived_at: null,
                  clerk_org_id: input.clerkOrgId,
                  id: organisationId,
                  is_active: true,
                },
              });
              if (organisation?.country_code !== "AU") {
                throw new Error("invalid_country");
              }
            } else {
              const entitlement = await checkPayrollEntityEntitlement(
                input.clerkOrgId,
                tx
              );
              if (!(entitlement.ok && entitlement.value.allowed)) {
                throw new Error("plan_limit_exceeded");
              }
              const created = await createCompany(
                {
                  clerkOrgId: input.clerkOrgId,
                  countryCode: "AU",
                  name: selected.tenantName,
                  timezone: "Australia/Brisbane",
                },
                tx
              );
              organisationId = created.id;
            }
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`xero-organisation:${organisationId}`}, 0))::text`;
            await tx.$queryRaw`SELECT id FROM xero_connections WHERE clerk_org_id = ${input.clerkOrgId} AND organisation_id = ${organisationId}::uuid FOR UPDATE`;
            const scope = {
              clerk_org_id: input.clerkOrgId,
              organisation_id: organisationId,
            };
            const current = await tx.xeroConnection.findFirst({ where: scope });
            const connectionSnapshot = connectionSnapshots.find(
              (binding) => binding.organisation_id === organisationId
            );
            if (
              Boolean(current) !== Boolean(connectionSnapshot) ||
              (current &&
                connectionSnapshot &&
                (current.id !== connectionSnapshot.id ||
                  current.updated_at.getTime() !==
                    connectionSnapshot.updated_at.getTime() ||
                  current.xero_authorisation_id !==
                    connectionSnapshot.xero_authorisation_id ||
                  current.remote_connection_id !==
                    connectionSnapshot.remote_connection_id ||
                  current.status !== connectionSnapshot.status))
            ) {
              throw new Error("connection_changed");
            }
            if (
              current?.released_at ||
              (current && current.xero_tenant_id !== tenantId)
            ) {
              throw new Error("tenant_replacement_required");
            }
            const freshGrant = await tx.xeroAuthorisation.findUnique({
              where: { id: grantId },
            });
            if (freshGrant?.status !== "active") {
              throw new Error("connection_inactive");
            }
            const now = new Date();
            const data = {
              balance_next_person_id: null,
              balance_sweep_failed: false,
              disconnected_at: null,
              initial_sync_completed_at: null,
              initial_sync_requested_at: now,
              last_connected_at: now,
              last_error_code: null,
              last_error_message: null,
              leave_next_person_id: null,
              leave_sweep_failed: false,
              payroll_region: "AU" as const,
              remote_connection_id: selected.connectionId,
              status: "active" as const,
              sync_paused_at:
                current?.status === "disconnected"
                  ? null
                  : (current?.sync_paused_at ?? null),
              tenant_name: selected.tenantName,
              tenant_type: "ORGANISATION",
              xero_authorisation_id: grantId,
            };
            const saved = current
              ? await tx.xeroConnection.update({
                  data,
                  where: { ...scope, id: current.id },
                })
              : await tx.xeroConnection.create({
                  data: { ...scope, ...data, xero_tenant_id: tenantId },
                });
            await tx.auditEvent.create({
              data: {
                ...scope,
                action: "xero_connected",
                actor_user_id: input.userId,
                resource_id: saved.id,
                resource_type: "xero_connection",
              },
            });
            const result: XeroTenantSelectionOutcome = {
              action: current ? "reconnected" : "connected",
              connectionId: saved.id,
              ok: true,
              organisationId,
              tenantId,
            };
            const previous = readSelectionOutcomes(
              activeSession.available_tenants_json
            );
            await tx.xeroOAuthSession.update({
              data: {
                available_tenants_json: {
                  outcomes: [...previous, result],
                  tenants: candidates.map((tenant) => ({ ...tenant })),
                },
              },
              where: { id: activeSession.id },
            });
            if (
              current?.xero_authorisation_id &&
              current.xero_authorisation_id !== grantId
            ) {
              obsoleteGrants.add(current.xero_authorisation_id);
            }
            return result;
          });
        } catch (error) {
          const reason = error instanceof Error ? error.message : "";
          let code: XeroOAuthError["code"] = "tenant_binding_conflict";
          if (
            reason === "plan_limit_exceeded" ||
            reason === "invalid_country" ||
            reason === "tenant_replacement_required"
          ) {
            code = reason;
          }
          outcome = {
            error: {
              code,
              message:
                code === "plan_limit_exceeded"
                  ? "Your current plan has reached its Xero file limit."
                  : "This Xero file cannot be connected to this account.",
            },
            ok: false,
            tenantId,
          };
        }
      }
    } else {
      outcome = {
        error: {
          code: "tenant_not_found",
          message: "The selected Xero file is no longer available.",
        },
        ok: false,
        tenantId,
      };
    }
    outcomes.push(outcome);
  }
  const finalizedOutcomes = await systemDatabase.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM xero_oauth_sessions WHERE id = ${session.id}::uuid AND clerk_org_id = ${input.clerkOrgId} FOR UPDATE`;
    const latest = await tx.xeroOAuthSession.findFirst({
      where: {
        clerk_org_id: input.clerkOrgId,
        created_by_user_id: input.userId,
        id: session.id,
      },
    });
    const saved = readSelectionOutcomes(latest?.available_tenants_json);
    const merged = outcomes.map(
      (outcome) =>
        saved.find((prior) => prior.tenantId === outcome.tenantId) ?? outcome
    );
    if (
      latest?.status === "selecting" &&
      latest.xero_authorisation_id === grantId
    ) {
      await tx.xeroOAuthSession.update({
        data: {
          available_tenants_json: {
            outcomes: [
              ...saved.filter((prior) => !ids.data.includes(prior.tenantId)),
              ...merged,
            ],
          },
          nonce_hash: null,
          state_hash: null,
          status: "completed",
          xero_authorisation_id: null,
        },
        where: { id: latest.id },
      });
    }
    return merged;
  });
  await Promise.allSettled(
    [...obsoleteGrants, grantId].map(cleanupUnusedSelectionGrant)
  );
  if (outcomes.some((outcome) => outcome.ok)) {
    await invalidateAccountFeedCaches({ clerkOrgId: input.clerkOrgId });
  }
  return { ok: true, value: { outcomes: finalizedOutcomes, returnTo } };
}

async function cleanupUnusedSelectionGrant(
  authorisationId: string
): Promise<void> {
  const grant = await systemDatabase.xeroAuthorisation.findUnique({
    select: { provider_app_id: true, xero_user_id: true },
    where: { id: authorisationId },
  });
  if (!grant) {
    return;
  }
  await withXeroGrantLock(
    {
      deadlineAt: Date.now() + 15_000,
      mode: "refresh",
      providerAppId: grant.provider_app_id,
      xeroUserId: grant.xero_user_id,
    },
    async (tx) => {
      const now = new Date();
      await tx.xeroOAuthSession.updateMany({
        data: { xero_authorisation_id: null },
        where: {
          OR: [
            { expires_at: { lte: now } },
            { status: { in: ["completed", "cancelled"] } },
          ],
          xero_authorisation_id: authorisationId,
        },
      });
      await tx.xeroAuthorisation.deleteMany({
        where: {
          connections: { none: {} },
          id: authorisationId,
          sessions: { none: {} },
        },
      });
    }
  );
}
