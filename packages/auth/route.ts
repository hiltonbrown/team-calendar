import "server-only";

import { toNextJsHandler } from "better-auth/next-js";
import { getBetterAuth } from "./adapters/better-auth-server";
import { authContextMode } from "./selection";

const publicUserFields = [
  "id",
  "email",
  "emailVerified",
  "name",
  "image",
  "createdAt",
  "updatedAt",
];
const publicSessionFields = [
  "id",
  "userId",
  "expiresAt",
  "createdAt",
  "updatedAt",
  "activeOrganizationId",
];
const publicAccountFields = [
  "id",
  "name",
  "slug",
  "logo",
  "createdAt",
  "countryCode",
  "provisioningStatus",
];
const publicMemberFields = [
  "id",
  "organizationId",
  "userId",
  "role",
  "createdAt",
];
const authPathPrefix = /^\/api\/auth/;
const allowedPaths = [
  /^\/(?:ok|error|sign-up\/email|get-session|sign-out|sign-in\/(?:email|social|magic-link)|magic-link\/verify|send-verification-email|verify-email|request-password-reset|reset-password|change-password|link-social|unlink-account|list-accounts|update-user)$/,
  /^\/reset-password\/[^/]+$/,
  /^\/callback\/(?:google|microsoft|xero-auth)$/,
  /^\/organization\/(?:list|get-full-organization|get-active-member|get-active-member-role|set-active)$/,
];
const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
const pick = (value: unknown, fields: readonly string[]) =>
  record(value)
    ? Object.fromEntries(
        fields
          .filter((key) => Object.hasOwn(value, key))
          .map((key) => [key, value[key]])
      )
    : null;

/** Native JSON can contain bearer values; browser responses use explicit projections. */
export function projectAuthResponse(path: string, value: unknown): unknown {
  if (value === null) {
    return null;
  }
  if (path === "/organization/list" && Array.isArray(value)) {
    return value.map((account) => pick(account, publicAccountFields));
  }
  if (!record(value)) {
    return null;
  }
  if (
    typeof value.code === "string" ||
    (!value.id && typeof value.message === "string")
  ) {
    return pick(value, ["code", "message"]);
  }
  if (
    [
      "/organization/get-full-organization",
      "/organization/set-active",
    ].includes(path)
  ) {
    const account = pick(value, publicAccountFields);
    if (account && Array.isArray(value.members)) {
      account.members = value.members.map((member) => {
        const output = pick(member, publicMemberFields);
        if (output && record(member)) {
          output.user = pick(member.user, publicUserFields);
        }
        return output;
      });
    }
    return account;
  }
  if (path === "/organization/get-active-member") {
    return pick(value, publicMemberFields);
  }
  if (path === "/organization/get-active-member-role") {
    return pick(value, ["role"]);
  }
  if (path === "/get-session") {
    return {
      session: pick(value.session, publicSessionFields),
      user: pick(value.user, publicUserFields),
    };
  }
  // All browser DTOs omit arbitrary metadata and provider credentials.
  const output = pick(value, [
    "status",
    "success",
    "code",
    "message",
    "url",
    "redirect",
  ]);
  if (record(output) && value.user) {
    output.user = pick(value.user, publicUserFields);
  }
  return output;
}

export async function handleAuthRequest(request: Request): Promise<Response> {
  if (authContextMode() !== "local") {
    return Response.json({ message: "Not found" }, { status: 404 });
  }
  const path = new URL(request.url).pathname.replace(authPathPrefix, "");
  if (!allowedPaths.some((pattern) => pattern.test(path))) {
    return Response.json({ message: "Not found" }, { status: 404 });
  }
  const response = await getBetterAuth().handler(request);
  if (!response.headers.get("content-type")?.includes("application/json")) {
    return response;
  }
  const body: unknown = await response.json();
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.delete("etag");
  headers.set("Cache-Control", "no-store");
  // New Headers preserves each Set-Cookie value in the supported server runtime.
  return new Response(JSON.stringify(projectAuthResponse(path, body)), {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

export const { GET, POST } = toNextJsHandler(handleAuthRequest);
