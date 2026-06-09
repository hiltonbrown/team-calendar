import { buildXeroOAuthStartUrl } from "@repo/xero";
import { NextResponse } from "next/server";

export function GET(request: Request) {
  const url = new URL(request.url);
  const clerkOrgId = url.searchParams.get("clerkOrgId");
  const organisationId = url.searchParams.get("organisationId");
  const returnTo = url.searchParams.get("returnTo") ?? undefined;
  const userId = url.searchParams.get("userId") ?? undefined;

  if (!clerkOrgId) {
    return NextResponse.json(
      { error: "Missing Clerk organisation ID." },
      { status: 400 }
    );
  }

  const result = buildXeroOAuthStartUrl({
    clerkOrgId,
    organisationId,
    returnTo,
    userId,
  });
  if (!result.ok) {
    const status = result.error.code === "connect_disabled" ? 403 : 400;
    return NextResponse.json({ error: result.error.message }, { status });
  }

  return NextResponse.redirect(result.value.redirectUrl);
}
