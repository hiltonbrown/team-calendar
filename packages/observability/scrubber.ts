import type { Breadcrumb, Event, EventHint, Log } from "@sentry/nextjs";

const SENSITIVE_PATTERNS = [
  /token/i,
  /secret/i,
  /authorization/i,
  /cookie/i,
  /access_token/i,
  /refresh_token/i,
  /code/i,
  /xero/i,
  /payload/i,
  /calendar/i,
  /ics/i,
  /summary/i,
  /description/i,
  /email/i,
  /password/i,
  /encryption_key/i,
  /clerk/i,
  /stripe/i,
  /message/i,
  /query/i,
  /param(?:s|eter|eters)?/i,
  /response/i,
  /cause/i,
];

const NON_SECRET_OPERATIONAL_KEYS = new Set([
  "actingClerkOrgId",
  "blockedOrigin",
  "clerkOrgId",
  "columnNumber",
  "disposition",
  "documentOrigin",
  "effectiveDirective",
  "errorCode",
  "lineNumber",
  "sourceOrigin",
  "statusCode",
  "stripeSubscriptionId",
  "xeroWriteSucceeded",
]);

export const isSensitiveKey = (key: string): boolean =>
  !NON_SECRET_OPERATIONAL_KEYS.has(key) &&
  SENSITIVE_PATTERNS.some((pattern) => pattern.test(key));

const sanitizeValue = (value: unknown): unknown => {
  if (value instanceof Error) {
    return { name: value.name };
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value && typeof value === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      sanitized[key] = sanitizeKeyValue(key, nestedValue);
    }
    return sanitized;
  }
  return value;
};

const sanitizeKeyValue = (key: string, value: unknown): unknown => {
  if (key.toLowerCase() === "error") {
    return value instanceof Error ? { name: value.name } : "[SCRUBBED]";
  }
  return isSensitiveKey(key) ? "[SCRUBBED]" : sanitizeValue(value);
};

export const sanitizeObject = (
  obj: Record<string, unknown>
): Record<string, unknown> => {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    sanitized[key] = sanitizeKeyValue(key, value);
  }
  return sanitized;
};

export const scrubSentryEvent = <T extends Event>(
  event: T,
  _hint?: EventHint
): T => {
  if (!event) {
    return event;
  }

  if (event.request) {
    event.request.url = undefined;
    event.request.query_string = undefined;
    if (event.request.headers) {
      event.request.headers = sanitizeObject(
        event.request.headers as Record<string, unknown>
      ) as Record<string, string>;
    }
    if (event.request.cookies) {
      event.request.cookies = sanitizeObject(
        event.request.cookies as Record<string, unknown>
      ) as Record<string, string>;
    }
    if (event.request.data) {
      if (typeof event.request.data === "object") {
        event.request.data = sanitizeObject(
          event.request.data as Record<string, unknown>
        );
      } else {
        event.request.data = "[SCRUBBED]";
      }
    }
  }

  if (event.extra) {
    event.extra = sanitizeObject(event.extra);
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map(scrubSentryBreadcrumb);
  }

  event.message = event.message ? "[SCRUBBED]" : event.message;
  if (event.exception?.values) {
    event.exception.values = event.exception.values.map((value) => ({
      ...value,
      value: value.value ? "[SCRUBBED]" : value.value,
    }));
  }

  if (event.user) {
    event.user.id = undefined;
    event.user.email = undefined;
    event.user.username = undefined;
    event.user.ip_address = undefined;
  }

  return event;
};

export const scrubSentryBreadcrumb = (breadcrumb: Breadcrumb): Breadcrumb => ({
  ...breadcrumb,
  data: breadcrumb.data ? sanitizeObject(breadcrumb.data) : undefined,
  message: breadcrumb.message ? "[SCRUBBED]" : breadcrumb.message,
});

export const scrubSentryLog = (log: Log): Log => ({
  ...log,
  attributes: log.attributes ? sanitizeObject(log.attributes) : undefined,
  message: "[SCRUBBED]",
});
