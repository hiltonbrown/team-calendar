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
import { database, withXeroGrantLock } from "@repo/database";
import type {
  XeroAuthorisation,
  XeroConnection,
  XeroOAuthSession,
} from "@repo/database/generated/client";
import { Prisma } from "@repo/database/generated/client";
import { ensureDefaultCalendarFeed } from "@repo/feeds";
import { log } from "@repo/observability/log";
import { z } from "zod";
import { keys } from "../../keys";
import { createXeroDeadline, type XeroDeadline } from "../rate-limit/deadline";
import { XERO_TOKEN_OPERATION_BUDGET_MS } from "../rate-limit/limits";
import type { XeroRateClass } from "../rate-limit/shared-store";
import { xeroFetch } from "../rate-limit/xero-fetch";
import {
  adoptXeroAuthorisation,
  authorisationAccessToken,
  resolveXeroAccess,
} from "./authorisation";
import {
  verifyXeroAccessTokenIdentity,
  type XeroAccessTokenIdentity,
} from "./identity";
import { XERO_SCOPES } from "./scopes";
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
  organisationId: null | string;
  returnTo: string;
  sessionId: string;
  userId: null | string;
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

  return true;
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
  const session = await database.xeroOAuthSession.findFirst({
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
  if (input.returnTo !== undefined && !isLocalApplicationPath(input.returnTo)) {
    return invalidState();
  }
  if (
    input.organisationId &&
    !(await database.organisation.findFirst({
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
  const session = await database.xeroOAuthSession.create({
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
      organisationId: session.organisation_id,
      returnTo: session.return_to,
      sessionId: session.id,
      userId: session.created_by_user_id,
    },
    secret
  );
  await database.xeroOAuthSession.updateMany({
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
  const claimed = await database.xeroOAuthSession.updateMany({
    data: { callback_claimed_at: new Date(), status: "exchanging" },
    where: {
      ...scope,
      expires_at: { gt: new Date() },
      nonce_hash: createHash("sha256").update(input.nonce).digest("hex"),
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
    const organisations = await database.organisation.findMany({
      select: { id: true },
      where: {
        archived_at: null,
        clerk_org_id: signed.clerkOrgId,
        is_active: true,
      },
    });
    const [onlyTenant] = grant.value.tenants;
    if (
      grant.value.tenants.length === 1 &&
      onlyTenant &&
      (signed.organisationId || organisations.length <= 1)
    ) {
      const selected = await completeXeroTenantSelection({
        clerkOrgId: signed.clerkOrgId,
        organisationId: signed.organisationId ?? organisations[0]?.id ?? null,
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
  const cancelled = await database.xeroOAuthSession.updateMany({
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
  await database.xeroOAuthSession.updateMany({
    data: {
      available_tenants_json: Prisma.DbNull,
      nonce_hash: null,
      state_hash: null,
      status,
      xero_authorisation_id: null,
    },
    where: scope,
  });
}
async function fetchConnections(
  accessToken: string,
  rateClass: XeroRateClass,
  authEventId?: string,
  deadline?: XeroDeadline
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
async function validatePreviousSelectedLink({
  snapshot,
  targetOrganisationId,
  clerkOrgId,
  grant,
  selected,
  inventory,
}: {
  snapshot: Pick<
    XeroConnection,
    "id" | "remote_connection_id" | "status" | "xero_authorisation_id"
  > | null;
  targetOrganisationId: string | null;
  clerkOrgId: string;
  grant: XeroAuthorisation;
  selected: ConnectionResponse;
  inventory: Result<ConnectionResponse[], XeroOAuthError>;
}): Promise<Result<null, XeroOAuthError>> {
  if (
    snapshot?.remote_connection_id &&
    snapshot.status !== "disconnected" &&
    (snapshot.xero_authorisation_id !== grant.id ||
      snapshot.remote_connection_id !== selected.connectionId)
  ) {
    let previousInventory = inventory;
    if (snapshot.xero_authorisation_id !== grant.id && targetOrganisationId) {
      const previousAccess = await resolveXeroAccess({
        capability: [],
        clerkOrgId,
        connectionId: snapshot.id,
        deadline: createXeroDeadline(XERO_TOKEN_OPERATION_BUDGET_MS),
        organisationId: targetOrganisationId,
      });
      if (!previousAccess.ok) {
        return {
          error: {
            code: "tenant_binding_conflict",
            message:
              "Reconnect with the previous Xero authoriser or remove the old connection in Xero before reconnecting.",
          },
          ok: false,
        };
      }
      previousInventory = await fetchConnections(
        previousAccess.value.accessToken,
        { kind: "user_inventory", providerAppId: grant.provider_app_id }
      );
    }
    if (!previousInventory.ok) {
      return previousInventory;
    }
    if (
      previousInventory.value.some(
        (tenant) => tenant.connectionId === snapshot.remote_connection_id
      )
    ) {
      return {
        error: {
          code: "tenant_binding_conflict",
          message:
            "Remove the previous connection in Xero before connecting with a different authoriser or remote link.",
        },
        ok: false,
      };
    }
  }
  return { ok: true, value: null };
}

export async function completeXeroTenantSelection(input: {
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
  const grant = await database.xeroAuthorisation.findUnique({
    where: { id: session.xero_authorisation_id ?? "" },
  });
  if (!grant) {
    return {
      error: { code: "session_not_found", message: "Start again." },
      ok: false,
    };
  }
  const targetOrganisationId =
    session.organisation_id ?? input.organisationId ?? null;
  const connectionSnapshot = targetOrganisationId
    ? await database.xeroConnection.findFirst({
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
        },
      })
    : null;
  const connections = await fetchConnections(authorisationAccessToken(grant), {
    kind: "user_inventory",
    providerAppId: grant.provider_app_id,
  });
  if (!connections.ok) {
    return connections;
  }
  const candidate = readAvailableTenants(session.available_tenants_json).find(
    (t) => t.tenantId === input.tenantId
  );
  const selected = connections.value.find(
    (t) =>
      t.tenantId === candidate?.tenantId &&
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
  const previousLink = await validatePreviousSelectedLink({
    clerkOrgId: input.clerkOrgId,
    grant,
    inventory: connections,
    selected,
    snapshot: connectionSnapshot,
    targetOrganisationId,
  });
  if (!previousLink.ok) {
    return previousLink;
  }
  const region = await inferPayrollRegionForTenant({
    accessToken: authorisationAccessToken(grant),
    rateClass: {
      kind: "tenant",
      providerAppId: grant.provider_app_id,
      xeroTenantId: selected.tenantId,
    },
    tenantId: selected.tenantId,
  });
  if (!region.ok) {
    return region;
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
  if (
    session.organisation_id &&
    input.organisationId &&
    input.organisationId !== session.organisation_id
  ) {
    return invalidState();
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
    const connection = await database.$transaction(async (tx) => {
      const claimed = await tx.xeroOAuthSession.updateMany({
        data: {
          available_tenants_json: Prisma.DbNull,
          nonce_hash: null,
          selected_payroll_region: region.value.payrollRegion,
          selected_tenant_id: selected.tenantId,
          selected_tenant_name: selected.tenantName,
          state_hash: null,
          status: "completed",
          xero_authorisation_id: null,
        },
        where: {
          clerk_org_id: input.clerkOrgId,
          created_by_user_id: input.userId,
          expires_at: { gt: new Date() },
          id: session.id,
          organisation_id: session.organisation_id,
          status: "selecting",
        },
      });
      if (!claimed.count) {
        throw new Error("session_not_found");
      }
      const organisationId =
        organisation.value.kind === "existing"
          ? organisation.value.id
          : (await tx.organisation.create({ data: organisation.value.create }))
              .id;
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
      if (current && current.xero_tenant_id !== selected.tenantId) {
        throw new Error("tenant_replacement_required");
      }
      const data = {
        disconnected_at: null,
        last_connected_at: new Date(),
        last_error_code: null,
        last_error_message: null,
        payroll_region: region.value.payrollRegion,
        remote_connection_id: selected.connectionId,
        status: "active" as const,
        sync_paused_at:
          current?.status === "disconnected"
            ? null
            : (current?.sync_paused_at ?? null),
        tenant_name: selected.tenantName,
        tenant_type: "ORGANISATION",
        xero_authorisation_id: grant.id,
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
    if (organisation.value.kind === "create") {
      await provisionNewOrganisationDefaults({
        clerkOrgId: input.clerkOrgId,
        organisationId: connection.organisation_id,
      });
    }
    return {
      ok: true,
      value: {
        connectionId: connection.id,
        organisationId: connection.organisation_id,
        returnTo: session.return_to,
      },
    };
  } catch (error) {
    const code =
      error instanceof Error && error.message === "tenant_replacement_required"
        ? "tenant_replacement_required"
        : "tenant_binding_conflict";
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
  const sessions = await database.xeroOAuthSession.findMany({
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
  await database.xeroOAuthSession.deleteMany({
    where: { ...closed, xero_authorisation_id: null },
  });
}
