import type { Page } from "@playwright/test";
import { describe, expect, it, vi } from "vitest";
import { readBrowserAuthIdentity, signInTestUser } from "../testing/playwright";

const email = "test@example.com";
const password = "fixture-password-for-test";

function authContext() {
  return {
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    session: {
      accountId: "11111111-1111-4111-8111-111111111111",
      role: "viewer",
      sessionId: "22222222-2222-4222-8222-222222222222",
      userId: "33333333-3333-4333-8333-333333333333",
    },
    user: {
      email,
      emailVerified: true,
      id: "33333333-3333-4333-8333-333333333333",
      image: null,
      name: "Test user",
    },
  };
}

function testPage({
  context = authContext(),
  signInStatus = 200,
  contextStatus = 200,
}: {
  context?: unknown;
  signInStatus?: number;
  contextStatus?: number;
} = {}) {
  const post = vi.fn(async () => ({
    ok: () => signInStatus >= 200 && signInStatus < 300,
    status: () => signInStatus,
  }));
  const get = vi.fn(async () => ({
    json: async () => ({ context }),
    ok: () => contextStatus >= 200 && contextStatus < 300,
    status: () => contextStatus,
  }));
  // Only Playwright's external HTTP boundary is replaced in this unit test.
  const page = {
    request: { get, post },
    url: () => "http://localhost:3000/sign-in",
  } as unknown as Page;
  return { get, page, post };
}

describe("release auth testing boundary", () => {
  it("signs in with explicit credentials through the browser cookie context", async () => {
    const { page, post } = testPage();
    await signInTestUser({ email, page, password });
    expect(post).toHaveBeenCalledWith(
      "http://localhost:3000/api/auth/sign-in/email",
      {
        data: { email, password },
        headers: { origin: "http://localhost:3000" },
        maxRedirects: 0,
      }
    );
  });

  it("rejects failed sign-in without reading an existing session", async () => {
    const { get, page } = testPage({ signInStatus: 401 });
    await expect(signInTestUser({ email, page, password })).rejects.toThrow(
      "Sign-in failed (401)"
    );
    expect(get).not.toHaveBeenCalled();
  });

  it("rejects missing credentials before dispatch", async () => {
    const { page, post } = testPage();
    await expect(
      signInTestUser({ email, page, password: "" })
    ).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
  });

  it("rejects a session belonging to another user", async () => {
    const context = authContext();
    context.user.email = "other@example.com";
    const { page } = testPage({ context });
    await expect(signInTestUser({ email, page, password })).rejects.toThrow(
      "Sign-in returned a different user"
    );
  });

  it("projects the validated neutral auth context", async () => {
    const { get, page } = testPage();
    expect(await readBrowserAuthIdentity(page)).toEqual({
      accountId: "11111111-1111-4111-8111-111111111111",
      email,
      role: "viewer",
      userId: "33333333-3333-4333-8333-333333333333",
    });
    expect(get).toHaveBeenCalledWith("http://localhost:3000/api/auth-context", {
      maxRedirects: 0,
    });
  });

  it("rejects resolver failures", async () => {
    const { page } = testPage({ contextStatus: 503 });
    await expect(readBrowserAuthIdentity(page)).rejects.toThrow(
      "Auth context failed (503)"
    );
  });

  it.each([
    ["absent", null],
    [
      "unknown role",
      {
        ...authContext(),
        session: { ...authContext().session, role: "unsupported" },
      },
    ],
    ["expired", { ...authContext(), expiresAt: "2020-01-01T00:00:00.000Z" }],
    [
      "unverified",
      {
        ...authContext(),
        user: { ...authContext().user, emailVerified: false },
      },
    ],
    [
      "different user IDs",
      {
        ...authContext(),
        user: {
          ...authContext().user,
          id: "44444444-4444-4444-8444-444444444444",
        },
      },
    ],
    [
      "no Account",
      {
        ...authContext(),
        session: { ...authContext().session, accountId: null },
      },
    ],
  ])("rejects an %s auth context", async (_name, context) => {
    const { page } = testPage({ context });
    await expect(readBrowserAuthIdentity(page)).rejects.toThrow();
  });
});
