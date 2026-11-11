"use server";

import { hasPermission, requireAccountResult } from "@repo/auth/server";
import { createCheckoutSession, createPortalSession } from "@repo/billing";
import { type AppError, appError, type Result } from "@repo/core";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import { isEarlyAccess } from "@repo/next-config/launch-mode";
import { redirect } from "next/navigation";

export async function startCheckout(
  planKey: "basic" | "premium"
): Promise<Result<never, AppError>> {
  assertNoTenantTransaction("startCheckout");

  const accountResult = await requireAccountResult();
  if (!accountResult.ok) {
    return accountResult;
  }

  const permitted = await hasPermission({ billing: ["checkout"] });
  if (!permitted) {
    return {
      error: appError("forbidden", "Permission denied"),
      ok: false,
    };
  }

  if (isEarlyAccess()) {
    return {
      error: appError(
        "bad_request",
        "Paid billing operations are disabled during early access."
      ),
      ok: false,
    };
  }

  const result = await createCheckoutSession(accountResult.value, planKey);
  if (result.ok) {
    redirect(result.value);
  }
  return result;
}

export async function startPortal(): Promise<Result<never, AppError>> {
  assertNoTenantTransaction("startPortal");

  const accountResult = await requireAccountResult();
  if (!accountResult.ok) {
    return accountResult;
  }

  const permitted = await hasPermission({ billing: ["portal"] });
  if (!permitted) {
    return {
      error: appError("forbidden", "Permission denied"),
      ok: false,
    };
  }

  if (isEarlyAccess()) {
    return {
      error: appError(
        "bad_request",
        "Paid billing operations are disabled during early access."
      ),
      ok: false,
    };
  }

  const result = await createPortalSession(accountResult.value);
  if (result.ok) {
    redirect(result.value);
  }
  return result;
}
