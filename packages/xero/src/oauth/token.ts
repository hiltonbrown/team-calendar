import type { Result } from "@repo/core";
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
import type { XeroOAuthError } from "./service";

const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";
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

export function callbackUrl(): string {
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

export async function exchangeToken(input: {
  code?: string;
  grantType: "authorization_code" | "refresh_token";
  deadline?: XeroDeadline;
  rateClass: XeroRateClass;
  refreshToken?: string;
}): Promise<Result<TokenResponse, XeroOAuthError>> {
  const clientId = keys().XERO_CLIENT_ID;
  const clientSecret = keys().XERO_CLIENT_SECRET;
  if (!(clientId && clientSecret)) {
    return {
      error: {
        code: "oauth_not_configured",
        message: "Connecting Xero is unavailable. Contact support.",
      },
      ok: false,
    };
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
      maxAttempts: 1,
      rateClass: input.rateClass,
      retryOnAmbiguousFailure: false,
      url: XERO_TOKEN_URL,
    });
  } catch (error) {
    return {
      error: {
        code: "network_error",
        dispatched: error instanceof XeroFetchError ? error.dispatched : true,
        message: "Xero is temporarily unavailable. Try again.",
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

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return {
      error: {
        code: "invalid_token_response",
        message: "Connecting Xero failed. Start again.",
      },
      ok: false,
    };
  }

  const parsed = TokenResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      error: {
        code: "invalid_token_response",
        message: "Connecting Xero failed. Start again.",
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
      message: "Xero is temporarily unavailable. Try again.",
      retryAfterMs:
        parseRetryAfter(response.headers.get("Retry-After")) ?? undefined,
    };
  }
  if (response.status >= 500 && response.status < 600) {
    return {
      code: "network_error",
      dispatched: true,
      message: "Xero is temporarily unavailable. Try again.",
    };
  }
  if (grantType !== "refresh_token") {
    return {
      code: "unknown_error",
      message: "Connecting Xero failed. Start again.",
    };
  }

  const errorCode = await readOAuthErrorCode(response);
  if (errorCode === "invalid_grant" || errorCode === "refresh_token_invalid") {
    return {
      code: "refresh_token_invalid",
      message: "Reconnect Xero to continue.",
    };
  }
  if (errorCode === "unauthorized_client" || errorCode === "invalid_client") {
    return {
      code: "client_credentials_invalid",
      message: "Connecting Xero is unavailable. Contact support.",
    };
  }
  return {
    code: "unknown_error",
    message: "Connecting Xero failed. Start again.",
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
