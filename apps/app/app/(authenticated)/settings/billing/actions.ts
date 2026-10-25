"use server";

import { createCheckoutSession, createPortalSession } from "@repo/billing";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import { isEarlyAccess } from "@repo/next-config/launch-mode";
import { redirect } from "next/navigation";
import { requirePagePermission } from "@/lib/auth/require-page-permission";
import { requireActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";

export async function startCheckout(planKey: "basic" | "premium") {
  assertNoTenantTransaction("startCheckout");
  // Server actions are directly invocable endpoints, so the page-level gate in
  // page.tsx does not protect them. Admits admins and owners, matching S-22.
  await requirePagePermission({ billing: ["checkout"] });
  if (isEarlyAccess()) {
    throw new Error(
      "Paid billing operations are disabled during early access."
    );
  }
  const { accountId } = await requireActiveOrgPageContext();
  const result = await createCheckoutSession(accountId, planKey);
  if (result.ok) {
    redirect(result.value);
  }
  throw new Error(result.error.message);
}

export async function startPortal() {
  assertNoTenantTransaction("startPortal");
  // Server actions are directly invocable endpoints, so the page-level gate in
  // page.tsx does not protect them. Admits admins and owners, matching S-22.
  await requirePagePermission({ billing: ["portal"] });
  if (isEarlyAccess()) {
    throw new Error(
      "Paid billing operations are disabled during early access."
    );
  }
  const { accountId } = await requireActiveOrgPageContext();
  const result = await createPortalSession(accountId);
  if (result.ok) {
    redirect(result.value);
  }
  throw new Error(result.error.message);
}
