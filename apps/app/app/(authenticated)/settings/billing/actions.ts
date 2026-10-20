"use server";

import { createCheckoutSession, createPortalSession } from "@repo/billing";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import { isEarlyAccess } from "@repo/next-config/launch-mode";
import { redirect } from "next/navigation";
import { requirePageRole } from "@/lib/auth/require-page-role";
import { requireActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";

export async function startCheckout(planKey: "basic" | "premium") {
  assertNoTenantTransaction("startCheckout");
  // Server actions are directly invocable endpoints, so the page-level gate in
  // page.tsx does not protect them. Admits admins and owners, matching S-22.
  await requirePageRole("org:admin");
  if (isEarlyAccess()) {
    throw new Error(
      "Paid billing operations are disabled during early access."
    );
  }
  const { clerkOrgId } = await requireActiveOrgPageContext();
  const result = await createCheckoutSession(clerkOrgId, planKey);
  if (result.ok) {
    redirect(result.value);
  }
  throw new Error(result.error.message);
}

export async function startPortal() {
  assertNoTenantTransaction("startPortal");
  // Server actions are directly invocable endpoints, so the page-level gate in
  // page.tsx does not protect them. Admits admins and owners, matching S-22.
  await requirePageRole("org:admin");
  if (isEarlyAccess()) {
    throw new Error(
      "Paid billing operations are disabled during early access."
    );
  }
  const { clerkOrgId } = await requireActiveOrgPageContext();
  const result = await createPortalSession(clerkOrgId);
  if (result.ok) {
    redirect(result.value);
  }
  throw new Error(result.error.message);
}
