import { getCurrentUser, requireAccount } from "@repo/auth/helpers";
import { withTenantResult } from "@repo/database";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import { markAsRead } from "@repo/notifications";
import { z } from "zod";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ notificationId: string }> }
): Promise<Response> {
  assertNoTenantTransaction("POST");
  let accountId: string;
  try {
    accountId = await requireAccount();
  } catch {
    return Response.json(
      {
        error: { code: "unauthorised", message: "Not authenticated" },
        ok: false,
      },
      { status: 401 }
    );
  }

  const user = await getCurrentUser();
  if (!user) {
    return Response.json(
      { error: { code: "unauthorised", message: "User not found" }, ok: false },
      { status: 401 }
    );
  }

  const { notificationId } = await params;
  const parsed = z
    .object({ notificationId: z.string().uuid() })
    .safeParse({ notificationId });
  if (!parsed.success) {
    return Response.json(
      {
        error: { code: "bad_request", message: "Invalid notification" },
        ok: false,
      },
      { status: 400 }
    );
  }

  const result = await withTenantResult(accountId, (db) =>
    markAsRead(
      {
        accountId,
        notificationId: parsed.data.notificationId,
        userId: user.id,
      },
      db
    )
  );
  if (!result.ok) {
    const status = result.error.code === "not_recipient" ? 403 : 404;
    return Response.json({ error: result.error, ok: false }, { status });
  }

  return Response.json({ ok: true, value: result.value });
}
