import { auth } from "@repo/auth/server";
import { dispatchInitialXeroSync } from "@repo/jobs";
import {
  cancelXeroOAuth,
  completeXeroOAuth,
  isLocalApplicationPath,
  isPreviewDeployment,
  readOAuthStateReturnTo,
} from "@repo/xero";
import { captureXeroConnected } from "@repo/xero/activation";
import { NextResponse } from "next/server";

const XERO_SETTINGS_PATH = "/settings/integrations/xero";

// Pages show plain-language copy for these codes; provider messages and
// internal error codes never reach the browser.
function safeErrorCode(code: string): string {
  switch (code) {
    case "invalid_state":
    case "session_not_found":
      return "expired";
    case "invalid_country":
    case "invalid_organisation_selection":
    case "organisation_not_found":
    case "tenant_binding_conflict":
    case "tenant_not_found":
    case "tenant_replacement_required":
      return "organisation";
    case "connection_changed":
      return "changed";
    case "network_error":
      return "unavailable";
    default:
      return "failed";
  }
}

// Send a failed callback back to the signed return path (or Xero settings
// when the state cannot be verified) with a safe code only.
function failureTarget(state: string, code: string, appBaseUrl: string): URL {
  const signedReturnTo = readOAuthStateReturnTo(state);
  const target = new URL(
    signedReturnTo && isLocalApplicationPath(signedReturnTo)
      ? signedReturnTo
      : XERO_SETTINGS_PATH,
    appBaseUrl
  );
  target.searchParams.set("xero_error", safeErrorCode(code));
  return target;
}

function clearNonce(response: NextResponse): NextResponse {
  response.cookies.delete({
    name: "xero_oauth_nonce",
    path: "/api/xero/oauth",
  });
  return response;
}
export async function GET(request: Request) {
  if (isPreviewDeployment()) {
    return clearNonce(
      NextResponse.json(
        {
          error:
            "Connecting Xero is disabled on preview deployments. Use the production deployment to connect Xero.",
        },
        { status: 403 }
      )
    );
  }
  const url = new URL(request.url);
  const code = url.searchParams.get("code"),
    state = url.searchParams.get("state");
  const cancelled = url.searchParams.get("error") === "access_denied";
  if (!(state && (code || cancelled))) {
    return clearNonce(
      NextResponse.json(
        { error: "Missing Xero OAuth callback parameters." },
        { status: 400 }
      )
    );
  }
  const session = await auth();
  if (!(session.orgId && session.userId)) {
    return clearNonce(
      NextResponse.json({ error: "Not authenticated." }, { status: 401 })
    );
  }
  if (session.orgRole !== "org:owner" && session.orgRole !== "org:admin") {
    return clearNonce(
      NextResponse.json(
        { error: "Only admins and owners can connect Xero." },
        { status: 403 }
      )
    );
  }
  const nonce = request.headers
    .get("cookie")
    ?.split(";")
    .map((cookie) => cookie.trim().split("=", 2))
    .find(([name]) => name === "xero_oauth_nonce")?.[1];
  const callback = {
    authenticatedClerkOrgId: session.orgId,
    authenticatedUserId: session.userId,
    nonce: nonce ?? null,
    state,
  };
  const result: Awaited<ReturnType<typeof completeXeroOAuth>> = cancelled
    ? await cancelXeroOAuth(callback)
    : await completeXeroOAuth({ ...callback, code: code ?? "" });
  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.url;
  if (!result.ok) {
    return clearNonce(
      NextResponse.redirect(failureTarget(state, result.error.code, appBaseUrl))
    );
  }
  if ("connected" in result.value && result.value.connected) {
    await captureXeroConnected({
      clerkOrgId: session.orgId,
      connectionId: result.value.connected.connectionId,
      organisationId: result.value.connected.organisationId,
    });
    try {
      await dispatchInitialXeroSync({
        clerkOrgId: session.orgId,
        connectionId: result.value.connected.connectionId,
        organisationId: result.value.connected.organisationId,
        triggeredByUserId: session.userId,
        triggerType: "manual",
      });
    } catch {
      // A committed connection is usable; the scheduler recovers failed initial dispatch.
    }
  }
  const redirectTo = isLocalApplicationPath(result.value.redirectTo)
    ? result.value.redirectTo
    : XERO_SETTINGS_PATH;
  return clearNonce(NextResponse.redirect(new URL(redirectTo, appBaseUrl)));
}
