import { parseRetryAfter, XeroFetchError } from "../rate-limit/xero-fetch";
import type { XeroRecoveryReason, XeroWriteError } from "../write/types";

interface FailureClassification {
  code: XeroWriteError["code"];
  recoveryReason: XeroRecoveryReason;
  retryAfterMs?: number;
}

const AUTH_TOKEN = /^[!#$%&'*+.^_`|~\dA-Za-z-]+$/;
const AUTH_PARAMETER =
  /^([!#$%&'*+.^_`|~\dA-Za-z-]+)\s*=\s*(?:"((?:[^"\\\r\n]|\\[^\r\n])*)"|([!#$%&'*+.^_`|~\dA-Za-z-]+))$/;
const AUTH_CHALLENGE = /^([!#$%&'*+.^_`|~\dA-Za-z-]+)\s+(.+)$/;

const INVALID_AUTH_HEADER = /[\r\n]/;

// Commas in quoted realms are data, and a new scheme ends the previous challenge.
export function hasInsufficientScopeChallenge(header: string | null): boolean {
  if (!header || INVALID_AUTH_HEADER.test(header)) {
    return false;
  }
  if (header === "insufficient_scope" || header === "insufficent_scope") {
    return true;
  }
  const parts = splitChallenges(header);
  if (!parts) {
    return false;
  }
  const challenges: { scheme: string; parameters: string[] }[] = [];
  for (const part of parts) {
    const challenge = part.match(AUTH_CHALLENGE);
    if (challenge && !AUTH_PARAMETER.test(part)) {
      challenges.push({
        parameters: [challenge[2] ?? ""],
        scheme: challenge[1] ?? "",
      });
    } else {
      challenges.at(-1)?.parameters.push(part);
    }
  }
  return challenges.some(
    (challenge) =>
      challenge.scheme.toLowerCase() === "bearer" &&
      bearerScopeError(challenge.parameters)
  );
}

function splitChallenges(header: string): string[] | null {
  const parts: string[] = [];
  let start = 0;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < header.length; index += 1) {
    const char = header[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quoted && char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
    }
    if (!quoted && char === ",") {
      parts.push(header.slice(start, index).trim());
      start = index + 1;
    }
  }
  if (quoted || escaped) {
    return null;
  }
  parts.push(header.slice(start).trim());
  return parts;
}

function bearerScopeError(parts: string[]): boolean {
  const parameters = new Set<string>();
  let scope = false;
  for (const part of parts) {
    const parsed = part.match(AUTH_PARAMETER);
    if (!parsed) {
      return false;
    }
    const key = parsed[1]?.toLowerCase() ?? "";
    if (parameters.has(key)) {
      return false;
    }
    parameters.add(key);
    if (key === "error") {
      const value = parsed[2] ?? parsed[3] ?? "";
      scope =
        AUTH_TOKEN.test(value) &&
        (value === "insufficient_scope" || value === "insufficent_scope");
    }
  }
  return scope;
}

function failureCode(error: unknown): string | undefined {
  return error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : undefined;
}

export function classifyXeroFailure(input: {
  response?: Response;
  error?: unknown;
  dispatched: boolean;
  isMutation: boolean;
}): FailureClassification {
  const status = input.response?.status;
  const code = failureCode(input.error);
  if (
    ((status === 401 || status === 403) &&
      hasInsufficientScopeChallenge(
        input.response?.headers.get("WWW-Authenticate") ?? null
      )) ||
    code === "capability_missing"
  ) {
    return { code: "permission_error", recoveryReason: "update_permissions" };
  }
  if (
    [
      "client_credentials_invalid",
      "configuration_error",
      "oauth_not_configured",
      "admission_unavailable",
      "unknown_key_version",
      "auth_tag_invalid",
      "decryption_failed",
      "origin_rejected",
    ].includes(code ?? "")
  ) {
    return { code: "unknown_error", recoveryReason: "operational_incident" };
  }
  if (
    [
      "not_connected",
      "disconnected",
      "generation_changed",
      "connection_changed",
      "connection_inactive",
    ].includes(code ?? "")
  ) {
    return { code: "auth_error", recoveryReason: "not_connected" };
  }
  if (
    status === 401 ||
    code === "reauthorisation_required" ||
    code === "refresh_token_invalid"
  ) {
    return { code: "auth_error", recoveryReason: "reauthorise" };
  }
  if (status === 403) {
    return { code: "permission_error", recoveryReason: "access_denied" };
  }
  if (
    status === 429 ||
    ["cooldown", "minute", "daily", "concurrency", "rate_limit_error"].includes(
      code ?? ""
    )
  ) {
    const retryAfterMs = input.response
      ? (parseRetryAfter(input.response.headers.get("Retry-After")) ??
        undefined)
      : undefined;
    return {
      code: "rate_limit_error",
      recoveryReason: "retry_later",
      retryAfterMs,
    };
  }
  return {
    code: "network_error",
    recoveryReason:
      input.dispatched && input.isMutation ? "outcome_unknown" : "retry_later",
  };
}

export function mapXeroTransportError(
  error: unknown,
  isMutation: boolean
): XeroWriteError {
  const dispatched = error instanceof XeroFetchError ? error.dispatched : true;
  return {
    ...classifyXeroFailure({ dispatched, error, isMutation }),
    dispatchPhase: dispatched ? "after_dispatch" : "before_dispatch",
    message: "Xero request could not be completed.",
  };
}

export function classifyXeroHttpFailure(
  response: Response,
  isMutation: boolean
): Partial<XeroWriteError> {
  if (![401, 403, 429].includes(response.status) && response.status < 500) {
    return {};
  }
  return classifyXeroFailure({ dispatched: true, isMutation, response });
}
