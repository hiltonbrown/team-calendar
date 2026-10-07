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
import {
  database,
  withScopedXeroConnectionLock,
  withXeroGrantLock,
} from "@repo/database";
import type { XeroOAuthSession } from "@repo/database/generated/client";
import { getScopedXeroConnection } from "@repo/database/queries/xero-connections";
import { ensureDefaultCalendarFeed } from "@repo/feeds";
import { log } from "@repo/observability/log";
import { z } from "zod";
import { keys } from "../../keys";
import { createXeroDeadline, type XeroDeadline } from "../rate-limit/deadline";
import { XERO_TOKEN_OPERATION_BUDGET_MS } from "../rate-limit/limits";
import type { XeroRateClass } from "../rate-limit/shared-store";
import {
  parseRetryAfter,
  XeroFetchError,
  xeroFetch,
} from "../rate-limit/xero-fetch";
import {
  adoptXeroAuthorisation,
  authorisationAccessToken,
  refreshXeroAuthorisation,
} from "./authorisation";

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
          message:
            "This Xero OAuth session has expired or is no longer available.",
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

export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;
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
export async function completeXeroOAuth(input: {
  authenticatedClerkOrgId?: string | null;
  authenticatedUserId?: string | null;
  code: string;
  nonce: string | null;
  state: string;
}): Promise<Result<{ redirectTo: string; sessionId: string }, XeroOAuthError>> {
  const state = verifyState(input.state);
  if (!state.ok) {
    return state;
  }
  const signed = state.value;
  if (
    !(input.nonce && constantTimeStringEqual(input.nonce, signed.nonce)) ||
    (input.authenticatedClerkOrgId !== undefined &&
      input.authenticatedClerkOrgId !== signed.clerkOrgId) ||
    (input.authenticatedUserId !== undefined &&
      input.authenticatedUserId !== signed.userId)
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
        const adopted = await adoptXeroAuthorisation(
          {
            accessToken: token.value.access_token,
            refreshToken: token.value.refresh_token,
            scopes: token.value.scope,
          },
          tx
        );
        if (adopted.ok) {
          await tx.xeroOAuthSession.updateMany({
            data: {
              status: "selecting",
              xero_authorisation_id: adopted.value.id,
            },
            where: { ...scope, status: "exchanging" },
          });
        }
        return adopted;
      }
    );
    if (!grant.ok) {
      await database.xeroOAuthSession.updateMany({
        data: { status: "cancelled" },
        where: scope,
      });
      return grant;
    }
    const connections = await fetchConnections(
      authorisationAccessToken(grant.value),
      { kind: "user_inventory", providerAppId: grant.value.provider_app_id }
    );
    if (!connections.ok) {
      return connections;
    }
    await database.xeroOAuthSession.updateMany({
      data: {
        available_tenants_json: {
          tenants: connections.value.map((t) => ({ ...t })),
        },
      },
      where: { ...scope, status: "selecting" },
    });
    return {
      ok: true,
      value: {
        redirectTo: `/settings/integrations/xero/connect?session=${signed.sessionId}`,
        sessionId: signed.sessionId,
      },
    };
  } catch {
    await database.xeroOAuthSession.updateMany({
      data: { status: "cancelled" },
      where: scope,
    });
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
    !(input.nonce && constantTimeStringEqual(input.nonce, signed.nonce)) ||
    (input.authenticatedClerkOrgId !== undefined &&
      input.authenticatedClerkOrgId !== signed.clerkOrgId) ||
    (input.authenticatedUserId !== undefined &&
      input.authenticatedUserId !== signed.userId)
  ) {
    return invalidState();
  }
  const cancelled = await database.xeroOAuthSession.updateMany({
    data: { status: "cancelled" },
    where: {
      clerk_org_id: signed.clerkOrgId,
      created_by_user_id: signed.userId,
      expires_at: { gt: new Date() },
      id: signed.sessionId,
      nonce_hash: createHash("sha256").update(input.nonce).digest("hex"),
      organisation_id: signed.organisationId,
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
async function fetchConnections(
  accessToken: string,
  rateClass: XeroRateClass
): Promise<Result<ConnectionResponse[], XeroOAuthError>> {
  const response = await xeroFetch({
    init: {
      headers: { Authorization: `Bearer ${accessToken}` },
      method: "GET",
    },
    rateClass,
    url: XERO_CONNECTIONS_URL,
  });
  if (!response.ok) {
    return {
      error: { code: "unknown_error", message: "Failed to load Xero files." },
      ok: false,
    };
  }
  const rows = z
    .array(
      z.object({
        id: z.string(),
        tenantId: z.string(),
        tenantName: z.string(),
        tenantType: z.string().optional(),
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
      .filter((row) => !row.tenantType || row.tenantType === "ORGANISATION")
      .map((row) => ({
        connectionId: row.id,
        tenantId: row.tenantId,
        tenantName: row.tenantName,
      })),
  };
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
          selected_payroll_region: region.value.payrollRegion,
          selected_tenant_id: selected.tenantId,
          selected_tenant_name: selected.tenantName,
          status: "completed",
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
  await database.xeroOAuthSession.deleteMany({
    where: {
      OR: [
        { expires_at: { lte: now } },
        { status: { in: ["cancelled", "completed"] } },
      ],
    },
  });
}
export async function ensureFreshXeroConnection(input: {
  clerkOrgId: string;
  organisationId: string;
  connectionId: string;
  deadline?: XeroDeadline;
  forceRefresh?: boolean;
  now?: Date;
}): Promise<Result<{ expiresAt: Date; refreshed: boolean }, XeroOAuthError>> {
  const scoped = await getScopedXeroConnection(input);
  if (
    !scoped.ok ||
    scoped.value.status !== "active" ||
    !scoped.value.authorisation
  ) {
    return {
      error: { code: "connection_inactive", message: "Reconnect Xero." },
      ok: false,
    };
  }
  const before = scoped.value.authorisation;
  const refreshed = await refreshXeroAuthorisation({
    authorisationId: before.id,
    deadline:
      input.deadline ?? createXeroDeadline(XERO_TOKEN_OPERATION_BUDGET_MS),
    forceRefresh: input.forceRefresh,
  });
  return refreshed.ok
    ? {
        ok: true,
        value: {
          expiresAt: refreshed.value.access_token_expires_at,
          refreshed:
            before.access_token_encrypted !==
            refreshed.value.access_token_encrypted,
        },
      }
    : refreshed;
}
export async function refreshXeroOAuthConnection(input: {
  clerkOrgId: string;
  organisationId: string;
  connectionId: string;
  deadline?: XeroDeadline;
}): Promise<Result<{ expiresAt: Date }, XeroOAuthError>> {
  return await ensureFreshXeroConnection({ ...input, forceRefresh: true });
}
export async function markXeroConnectionStale(input: {
  clerkOrgId: string;
  organisationId: string;
  connectionId: string;
  errorCode?: string;
  errorMessage?: string;
}): Promise<void> {
  await database.xeroConnection.updateMany({
    data: {
      last_error_code: input.errorCode ?? "access_failed",
      last_error_message: input.errorMessage ?? "Reconnect Xero.",
      status: "reconnect_required",
    },
    where: {
      clerk_org_id: input.clerkOrgId,
      id: input.connectionId,
      organisation_id: input.organisationId,
      status: "active",
    },
  });
}
export interface XeroDisconnectResult {
  connectionId: string;
  state: "disconnected";
}
export async function disconnectXeroOAuthConnection(input: {
  clerkOrgId: string;
  organisationId: string;
  connectionId: string;
  destructive: boolean;
  performedByUserId?: string | null;
}): Promise<Result<XeroDisconnectResult, XeroOAuthError>> {
  const scoped = await getScopedXeroConnection(input);
  if (
    !(
      scoped.ok &&
      scoped.value.authorisation &&
      scoped.value.remote_connection_id
    )
  ) {
    return {
      error: {
        code: "connection_inactive",
        message: "Reconnect Xero before disconnecting.",
      },
      ok: false,
    };
  }
  const grant = await refreshXeroAuthorisation({
    authorisationId: scoped.value.authorisation.id,
    deadline: createXeroDeadline(XERO_TOKEN_OPERATION_BUDGET_MS),
  });
  if (!grant.ok) {
    return grant;
  }
  try {
    return await withScopedXeroConnectionLock(
      input,
      Date.now() + 15_000,
      async (tx) => {
        const scope = {
          clerk_org_id: input.clerkOrgId,
          organisation_id: input.organisationId,
        };
        const connection = await tx.xeroConnection.findFirstOrThrow({
          where: { ...scope, id: input.connectionId },
        });
        if (
          connection.xero_authorisation_id !== grant.value.id ||
          connection.remote_connection_id !== scoped.value.remote_connection_id
        ) {
          throw new Error("connection_changed");
        }
        const response = await xeroFetch({
          deadline: createXeroDeadline(10_000),
          init: {
            headers: {
              Authorization: `Bearer ${authorisationAccessToken(grant.value)}`,
            },
            method: "DELETE",
          },
          rateClass: {
            kind: "user_inventory",
            providerAppId: grant.value.provider_app_id,
          },
          url: `${XERO_CONNECTIONS_URL}/${encodeURIComponent(connection.remote_connection_id ?? "")}`,
        });
        if (response.status !== 204 && response.status !== 404) {
          return {
            error: {
              code: "unknown_error",
              message: "Xero could not be disconnected. Try again.",
            },
            ok: false,
          };
        }
        const now = new Date();
        await tx.xeroSyncCursor.deleteMany({
          where: { ...scope, xero_connection_id: connection.id },
        });
        await tx.xeroConnection.updateMany({
          data: {
            balance_next_person_id: null,
            disconnected_at: now,
            disconnected_by_user_id: input.performedByUserId,
            last_disconnected_at: now,
            leave_next_person_id: null,
            remote_connection_id: null,
            status: "disconnected",
            sync_paused_at: now,
            xero_authorisation_id: null,
          },
          where: { ...scope, id: connection.id },
        });
        if (input.destructive) {
          await tx.syncRun.deleteMany({
            where: { ...scope, xero_connection_id: connection.id },
          });
          await tx.leaveBalance.deleteMany({
            where: { ...scope, xero_connection_id: connection.id },
          });
          await tx.xeroPersonMatch.deleteMany({ where: scope });
          await tx.person.updateMany({
            data: { archived_at: now, clerk_user_id: null },
            where: { ...scope, source_system: "XERO" },
          });
          await tx.person.updateMany({
            data: { xero_employee_id: null },
            where: scope,
          });
          await tx.availabilityRecord.updateMany({
            data: { archived_at: now, publish_status: "archived" },
            where: { ...scope, source_type: { in: ["xero", "xero_leave"] } },
          });
        }
        return {
          ok: true,
          value: { connectionId: connection.id, state: "disconnected" },
        };
      }
    );
  } catch {
    return {
      error: {
        code: "unknown_error",
        message: "Xero could not be disconnected. Try again.",
      },
      ok: false,
    };
  }
}
