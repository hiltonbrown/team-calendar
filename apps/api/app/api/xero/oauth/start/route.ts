import { currentUser, requireOrg, requireRole } from "@repo/auth/helpers";
import { buildXeroOAuthStartUrl } from "@repo/xero";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  let authenticatedClerkOrgId: string;
  try {
    authenticatedClerkOrgId = await requireOrg();
  } catch {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const [isAdmin, isOwner] = await Promise.all([
    requireRole("org:admin"),
    requireRole("org:owner"),
  ]);
  if (!(isAdmin || isOwner)) {
    return NextResponse.json(
      { error: "Only admins and owners can connect Xero." },
      { status: 403 }
    );
  }

  const url = new URL(request.url);
  const clerkOrgId = url.searchParams.get("clerkOrgId");
  const organisationId = url.searchParams.get("organisationId");
  const returnTo = url.searchParams.get("returnTo") ?? undefined;

  if (!clerkOrgId) {
    return NextResponse.json(
      { error: "Missing Clerk organisation ID." },
      { status: 400 }
    );
  }

  if (clerkOrgId !== authenticatedClerkOrgId) {
    return NextResponse.json(
      { error: "Organisation mismatch." },
      { status: 403 }
    );
  }

  const result = buildXeroOAuthStartUrl({
    clerkOrgId: authenticatedClerkOrgId,
    organisationId,
    returnTo,
    userId: user.id,
  });
  if (!result.ok) {
    const status = result.error.code === "connect_disabled" ? 403 : 400;
    return NextResponse.json({ error: result.error.message }, { status });
  }

  return NextResponse.redirect(result.value.redirectUrl);
}
