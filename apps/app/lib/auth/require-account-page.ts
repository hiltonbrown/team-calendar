import "server-only";

import { getCurrentUser, getSession } from "@repo/auth/server";
import type { AccountId } from "@repo/core";
import { redirect } from "next/navigation";

/** Real session and current membership checks run after optimistic routing. */
export async function requireAccountPage() {
  const session = await getSession();
  if (!session) {
    redirect("/sign-in");
  }
  const user = await getCurrentUser();
  if (!user || user.id !== session.userId) {
    redirect("/sign-in");
  }
  if (!user.emailVerified) {
    redirect("/verify-email");
  }
  if (!(session.accountId && session.role)) {
    redirect("/select-account");
  }
  // getSession validates the selected account membership at the auth boundary.
  const accountId = session.accountId as AccountId;
  return { accountId, session, user };
}
