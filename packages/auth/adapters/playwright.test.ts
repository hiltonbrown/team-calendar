import { describe, expect, it, vi } from "vitest";
import {
  readBrowserAuthIdentity,
  setupAuthTesting,
  setupAuthTestingToken,
  signInTestUser,
} from "../testing/playwright";

const mocks = vi.hoisted(() => ({
  setup: vi.fn(),
  signIn: vi.fn(),
  token: vi.fn(),
}));
vi.mock("@clerk/testing/playwright", () => ({
  clerk: { signIn: mocks.signIn },
  clerkSetup: mocks.setup,
  setupClerkTestingToken: mocks.token,
}));

describe("release auth testing boundary", () => {
  it("maps test sign-in without exposing SDK option names", async () => {
    const page = {};
    await setupAuthTesting();
    // The page is not used by this adapter, only forwarded to the SDK.
    await signInTestUser({ email: "test@example.com", page: page as never });
    await setupAuthTestingToken({ page: page as never });
    expect(mocks.setup).toHaveBeenCalledOnce();
    expect(mocks.signIn).toHaveBeenCalledWith({
      emailAddress: "test@example.com",
      page,
    });
    expect(mocks.token).toHaveBeenCalledWith({ page });
  });
  it("projects a browser identity with a neutral role", async () => {
    const page = {
      evaluate: vi.fn(async () => ({
        accountId: "account",
        email: "test@example.com",
        role: "org:viewer",
        userId: "user",
      })),
      waitForFunction: vi.fn(),
    };
    // This is a structural test page containing only the operations used here.
    expect(await readBrowserAuthIdentity(page as never)).toEqual({
      accountId: "account",
      email: "test@example.com",
      role: "viewer",
      userId: "user",
    });
  });
});
