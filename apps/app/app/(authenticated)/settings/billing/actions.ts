"use server";

import { hasPermission, requireAccountResult } from "@repo/auth/server";
import { createCheckoutSession, createPortalSession } from "@repo/billing";
import { type AppError, appError, type Result } from "@repo/core";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import { isEarlyAccess } from "@repo/next-config/launch-mode";
import { redirect } from "next/navigation";
import { requireActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";

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

  const { accountId } = await requireActiveOrgPageContext();
  const result = await createCheckoutSession(accountId, planKey);
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

  const { accountId } = await requireActiveOrgPageContext();
  const result = await createPortalSession(accountId);
  if (result.ok) {
    redirect(result.value);
  }
  return result;
}
