"use server";

import { createCheckoutSession, createPortalSession } from "@repo/billing";
import { redirect } from "next/navigation";
import { requireActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";

export async function startCheckout(planKey: "basic" | "premium") {
  const { clerkOrgId } = await requireActiveOrgPageContext();
  const result = await createCheckoutSession(clerkOrgId, planKey);
  if (result.ok) {
    redirect(result.value);
  }
  throw new Error(result.error.message);
}

export async function startPortal() {
  const { clerkOrgId } = await requireActiveOrgPageContext();
  const result = await createPortalSession(clerkOrgId);
  if (result.ok) {
    redirect(result.value);
  }
  throw new Error(result.error.message);
}
