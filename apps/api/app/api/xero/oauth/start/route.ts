import {
  getCurrentUser,
  hasPermission,
  requireAccount,
} from "@repo/auth/helpers";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import { buildXeroOAuthStartUrl } from "@repo/xero";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  assertNoTenantTransaction("GET");
  let authenticatedAccountId: string;
  try {
    authenticatedAccountId = await requireAccount();
  } catch {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let isAdmin = false;
  let isOwner = false;
  try {
    [isAdmin, isOwner] = await Promise.all([
      hasPermission({ xero: ["connect"] }),
      hasPermission({ ownership: ["manage"] }),
    ]);
  } catch {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  if (!(isAdmin || isOwner)) {
    return NextResponse.json(
      { error: "Only admins and owners can connect Xero." },
      { status: 403 }
    );
  }

  const url = new URL(request.url);
  const accountId = url.searchParams.get("accountId");
  const organisationId = url.searchParams.get("organisationId");
  const returnTo = url.searchParams.get("returnTo") ?? undefined;

  if (!accountId) {
    return NextResponse.json({ error: "Missing Account ID." }, { status: 400 });
  }

  if (accountId !== authenticatedAccountId) {
    return NextResponse.json(
      { error: "Organisation mismatch." },
      { status: 403 }
    );
  }

  const result = await buildXeroOAuthStartUrl({
    accountId: authenticatedAccountId,
    organisationId,
    returnTo,
    userId: user.id,
  });
  if (!result.ok) {
    const status = result.error.code === "connect_disabled" ? 403 : 400;
    return NextResponse.json({ error: result.error.message }, { status });
  }

  const response = NextResponse.redirect(result.value.redirectUrl);
  response.cookies.set("xero_oauth_nonce", result.value.nonce, {
    httpOnly: true,
    maxAge: 600,
    path: "/api/xero/oauth",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
