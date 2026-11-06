import type { Page } from "@playwright/test";
import { z } from "zod";
import { authContextSchema } from "../context-contract";
import type { AuthRole } from "../permissions";

export interface BrowserAuthIdentity {
  accountId: string | null;
  email: string | null;
  role: AuthRole | null;
  userId: string | null;
}

export async function signInTestUser({
  email,
  page,
  password,
}: {
  email: string;
  page: Page;
  password: string;
}): Promise<void> {
  const credentials = z
    .object({ email: z.email(), password: z.string().min(1) })
    .parse({ email, password });
  const { origin } = new URL(page.url());
  // Page.request shares the browser cookie jar, including response Set-Cookie.
  const response = await page.request.post(
    new URL("/api/auth/sign-in/email", origin).href,
    {
      data: credentials,
      headers: { origin },
      maxRedirects: 0,
    }
  );
  if (!response.ok()) {
    throw new Error(`Sign-in failed (${response.status()})`);
  }
  const identity = await readBrowserAuthIdentity(page);
  if (identity.email?.toLowerCase() !== email.toLowerCase()) {
    throw new Error("Sign-in returned a different user");
  }
}

export async function readBrowserAuthIdentity(
  page: Page
): Promise<BrowserAuthIdentity> {
  const response = await page.request.get(
    new URL("/api/auth-context", page.url()).href,
    { maxRedirects: 0 }
  );
  if (!response.ok()) {
    throw new Error(`Auth context failed (${response.status()})`);
  }
  const { context } = z
    .object({ context: authContextSchema })
    .strict()
    .parse(await response.json());
  if (
    Date.parse(context.expiresAt) <= Date.now() ||
    !context.user.emailVerified ||
    !context.user.email ||
    context.user.id !== context.session.userId ||
    !context.session.accountId ||
    !context.session.role
  ) {
    throw new Error("A verified active Account session is required");
  }
  return {
    accountId: context.session.accountId,
    email: context.user.email,
    role: context.session.role,
    userId: context.session.userId,
  };
}
