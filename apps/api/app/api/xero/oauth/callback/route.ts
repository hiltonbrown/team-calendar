import {
  completeXeroOAuth,
  isLocalApplicationPath,
  isPreviewDeployment,
} from "@repo/xero";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  // Xero connect is disabled on preview deployments because their callback URL
  // is not pre-registered on the Xero app. Reject any callback that reaches a
  // preview deployment rather than attempting a token exchange that cannot
  // succeed.
  if (isPreviewDeployment()) {
    return NextResponse.json(
      {
        error:
          "Connecting Xero is disabled on preview deployments. Use the production deployment to connect Xero.",
      },
      { status: 403 }
    );
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!(code && state)) {
    return NextResponse.json(
      { error: "Missing Xero OAuth callback parameters." },
      { status: 400 }
    );
  }

  const nonce = request.headers
    .get("cookie")
    ?.split(";")
    .map((cookie) => cookie.trim().split("=", 2))
    .find(([name]) => name === "xero_oauth_nonce")?.[1];
  const result = await completeXeroOAuth({ code, nonce: nonce ?? null, state });
  if (!result.ok) {
    return NextResponse.json({ error: result.error.message }, { status: 400 });
  }

  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.url;
  const redirectTo = isLocalApplicationPath(result.value.redirectTo)
    ? result.value.redirectTo
    : "/settings/integrations/xero";
  const response = NextResponse.redirect(
    new URL(redirectTo, appBaseUrl)
  );
  response.cookies.delete({
    name: "xero_oauth_nonce",
    path: "/api/xero/oauth",
  });
  return response;
}
