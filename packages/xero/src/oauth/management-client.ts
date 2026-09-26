import "server-only";
import { createHash } from "node:crypto";
import type { Result } from "@repo/core";
import { z } from "zod";
import { keys } from "../../keys";
import { remainingMs, type XeroDeadline } from "../rate-limit/deadline";
import {
  parseRetryAfter,
  type XeroFetchDeps,
  XeroFetchError,
  xeroFetch,
} from "../rate-limit/xero-fetch";

const managementTokenSchema = z.strictObject({
  access_token: z.string().min(1).brand<"XeroManagementAccessToken">(),
  expires_in: z.number().int().positive(),
  scope: z.string().optional(),
  token_type: z.string().regex(/^Bearer$/i),
});
export type XeroManagementAccessToken = z.infer<
  typeof managementTokenSchema
>["access_token"];
export interface XeroManagementFailure {
  kind: "auth_failed" | "not_sent";
}
export type XeroDeleteOutcome =
  | {
      kind:
        | "deleted"
        | "absent"
        | "auth_failed"
        | "server_error"
        | "not_sent"
        | "unknown";
    }
  | { kind: "rate_limited"; retryAfterMs: number | null };
interface ManagementInput {
  deadline: XeroDeadline;
  expectedProviderAppId: string;
}
const tokens = new Map<
  string,
  { token: XeroManagementAccessToken; usableUntil: number }
>();
const inFlight = new Map<
  string,
  Promise<Result<XeroManagementAccessToken, XeroManagementFailure>>
>();

function managementConfiguration(expectedProviderAppId: string) {
  const env = keys();
  if (
    !(env.XERO_CLIENT_ID && env.XERO_CLIENT_SECRET) ||
    env.XERO_CLIENT_ID !== expectedProviderAppId
  ) {
    return null;
  }
  return {
    cacheKey: createHash("sha256")
      .update(JSON.stringify([env.XERO_CLIENT_ID, env.XERO_CLIENT_SECRET]))
      .digest("hex"),
    clientId: env.XERO_CLIENT_ID,
    clientSecret: env.XERO_CLIENT_SECRET,
  };
}

export async function getXeroManagementToken(
  input: ManagementInput,
  deps: Partial<XeroFetchDeps> = {}
): Promise<Result<XeroManagementAccessToken, XeroManagementFailure>> {
  try {
    if (remainingMs(input.deadline) === 0) {
      return { error: { kind: "not_sent" }, ok: false };
    }
    const config = managementConfiguration(input.expectedProviderAppId);
    if (!config) {
      return { error: { kind: "not_sent" }, ok: false };
    }
    const cached = tokens.get(config.cacheKey);
    if (cached && cached.usableUntil > Date.now()) {
      return { ok: true, value: cached.token };
    }
    let operation = inFlight.get(config.cacheKey);
    if (!operation) {
      operation = acquireManagementToken(config, input.deadline, deps);
      inFlight.set(config.cacheKey, operation);
      const current = operation;
      operation
        .finally(() => {
          if (inFlight.get(config.cacheKey) === current) {
            inFlight.delete(config.cacheKey);
          }
        })
        .catch(() => {
          /* Acquisition returns only safe failures. */
        });
    }
    return await waitForToken(operation, input.deadline);
  } catch {
    return { error: { kind: "not_sent" }, ok: false };
  }
}

async function acquireManagementToken(
  config: NonNullable<ReturnType<typeof managementConfiguration>>,
  deadline: XeroDeadline,
  deps: Partial<XeroFetchDeps>
): Promise<Result<XeroManagementAccessToken, XeroManagementFailure>> {
  try {
    const response = await xeroFetch(
      {
        deadline,
        init: {
          body: new URLSearchParams({
            grant_type: "client_credentials",
            scope: "app.connections",
          }).toString(),
          headers: {
            Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          method: "POST",
        },
        maxAttempts: 1,
        rateClass: { kind: "app_management", providerAppId: config.clientId },
        retryOnAmbiguousFailure: false,
        url: "https://identity.xero.com/connect/token",
      },
      deps
    );
    if (response.status === 401 || response.status === 403) {
      return { error: { kind: "auth_failed" }, ok: false };
    }
    if (!response.ok) {
      return { error: { kind: "not_sent" }, ok: false };
    }
    const parsed = managementTokenSchema.safeParse(await response.json());
    if (!parsed.success) {
      return { error: { kind: "not_sent" }, ok: false };
    }
    const usableUntil = Date.now() + (parsed.data.expires_in - 60) * 1000;
    if (usableUntil > Date.now()) {
      tokens.set(config.cacheKey, {
        token: parsed.data.access_token,
        usableUntil,
      });
    }
    return { ok: true, value: parsed.data.access_token };
  } catch {
    return { error: { kind: "not_sent" }, ok: false };
  }
}

async function waitForToken(
  operation: Promise<Result<XeroManagementAccessToken, XeroManagementFailure>>,
  deadline: XeroDeadline
): Promise<Result<XeroManagementAccessToken, XeroManagementFailure>> {
  const budget = remainingMs(deadline);
  if (budget === 0) {
    return { error: { kind: "not_sent" }, ok: false };
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<Result<XeroManagementAccessToken, XeroManagementFailure>>(
        (resolve) => {
          timer = setTimeout(
            () => resolve({ error: { kind: "not_sent" }, ok: false }),
            budget
          );
        }
      ),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function deleteXeroConnection(
  input: ManagementInput & { remoteConnectionId: string },
  deps: Partial<XeroFetchDeps> = {}
): Promise<XeroDeleteOutcome> {
  if (!z.uuid().safeParse(input.remoteConnectionId).success) {
    return { kind: "not_sent" };
  }
  const token = await getXeroManagementToken(input, deps);
  if (!token.ok) {
    return token.error;
  }
  try {
    const response = await xeroFetch(
      {
        deadline: input.deadline,
        init: {
          headers: { Authorization: `Bearer ${token.value}` },
          method: "DELETE",
        },
        maxAttempts: 1,
        rateClass: {
          kind: "app_management",
          providerAppId: input.expectedProviderAppId,
        },
        retryOnAmbiguousFailure: false,
        url: `https://api.xero.com/connections/${input.remoteConnectionId}`,
      },
      deps
    );
    if (response.ok) {
      return { kind: "deleted" };
    }
    if (response.status === 404) {
      return { kind: "absent" };
    }
    if (response.status === 401 || response.status === 403) {
      const config = managementConfiguration(input.expectedProviderAppId);
      if (config) {
        tokens.delete(config.cacheKey);
      }
      return { kind: "auth_failed" };
    }
    if (response.status === 429) {
      return {
        kind: "rate_limited",
        retryAfterMs: parseRetryAfter(response.headers.get("Retry-After")),
      };
    }
    return {
      kind:
        response.status >= 500 && response.status < 600
          ? "server_error"
          : "unknown",
    };
  } catch (error) {
    return {
      kind:
        error instanceof XeroFetchError && !error.dispatched
          ? "not_sent"
          : "unknown",
    };
  }
}
