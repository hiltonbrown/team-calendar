import {
  clerk,
  clerkSetup,
  setupClerkTestingToken,
} from "@clerk/testing/playwright";
import type { Page } from "@playwright/test";
import { fromClerkRole } from "../adapters/clerk-roles";
import type { AuthRole } from "../permissions";

export interface BrowserAuthIdentity {
  accountId: string | null;
  email: string | null;
  role: AuthRole | null;
  userId: string | null;
}

export async function setupAuthTesting(): Promise<void> {
  await clerkSetup();
}
export async function signInTestUser({
  email,
  page,
}: {
  email: string;
  page: Page;
}): Promise<void> {
  await clerk.signIn({ emailAddress: email, page });
}
export async function setupAuthTestingToken({
  page,
}: {
  page: Page;
}): Promise<void> {
  await setupClerkTestingToken({ page });
}
export async function readBrowserAuthIdentity(
  page: Page
): Promise<BrowserAuthIdentity> {
  await page.waitForFunction(() => Boolean(window.Clerk?.user));
  const identity = await page.evaluate(() => ({
    accountId: window.Clerk?.organization?.id ?? null,
    email: window.Clerk?.user?.primaryEmailAddress?.emailAddress ?? null,
    role:
      window.Clerk?.user?.organizationMemberships.find(
        (membership) =>
          membership.organization.id === window.Clerk?.organization?.id
      )?.role ?? null,
    userId: window.Clerk?.user?.id ?? null,
  }));
  return { ...identity, role: fromClerkRole(identity.role) };
}
