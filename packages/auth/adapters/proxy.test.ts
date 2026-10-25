import { describe, expect, it, vi } from "vitest";
import { authMiddleware } from "../proxy";

const mocks = vi.hoisted(() => ({
  clerkMiddleware: vi.fn((handler) => handler),
  protect: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: mocks.clerkMiddleware,
}));

describe("neutral middleware adapter", () => {
  it("projects only requireAuthentication and preserves the response", async () => {
    const response = new Response("response");
    authMiddleware(async (context) => {
      expect(Object.keys(context)).toEqual(["requireAuthentication"]);
      await context.requireAuthentication();
      return response;
    });
    const handler = mocks.clerkMiddleware.mock.calls[0]?.[0];
    expect(await handler({ protect: mocks.protect }, {}, {})).toBe(response);
    expect(mocks.protect).toHaveBeenCalledOnce();
  });
});
