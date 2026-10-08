import { auth } from "@repo/auth/server";
import { dispatchInitialXeroSync } from "@repo/jobs";
import {
  cancelXeroOAuth,
  completeXeroOAuth,
  isLocalApplicationPath,
  isPreviewDeployment,
} from "@repo/xero";
import { captureXeroConnected } from "@repo/xero/activation";
import { NextResponse } from "next/server";

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
  if (!result.ok) {
    return clearNonce(
      NextResponse.json({ error: result.error.message }, { status: 400 })
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
  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.url;
  const redirectTo = isLocalApplicationPath(result.value.redirectTo)
    ? result.value.redirectTo
    : "/settings/integrations/xero";
  return clearNonce(NextResponse.redirect(new URL(redirectTo, appBaseUrl)));
}
