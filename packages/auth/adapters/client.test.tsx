import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSession } from "../client";

const mocks = vi.hoisted(() => ({
  openOrganizationProfile: vi.fn(),
  useAuth: vi.fn(),
}));
vi.mock("@clerk/nextjs", () => ({
  UserButton: Object.assign(
    ({ children }: { children: React.ReactNode }) =>
      createElement("div", null, children),
    {
      Action: ({ label, onClick }: { label: string; onClick: () => void }) => {
        onClick();
        return createElement("span", null, label);
      },
      MenuItems: ({ children }: { children: React.ReactNode }) =>
        createElement("div", null, children),
    }
  ),
  useAuth: mocks.useAuth,
  useClerk: () => ({ openOrganizationProfile: mocks.openOrganizationProfile }),
}));

describe("neutral client facade", () => {
  beforeEach(() => vi.resetAllMocks());
  it("projects the loaded session and no SDK functions", () => {
    mocks.useAuth.mockReturnValue({
      getToken: () => "secret",
      isLoaded: true,
      isSignedIn: true,
      orgId: "account",
      orgRole: "org:manager",
      sessionId: "session",
      userId: "user",
    });
    expect(useSession()).toEqual({
      isLoaded: true,
      session: {
        accountId: "account",
        role: "manager",
        sessionId: "session",
        userId: "user",
      },
    });
  });
  it("returns no session while loading or signed out", () => {
    mocks.useAuth.mockReturnValue({ isLoaded: false });
    expect(useSession()).toEqual({ isLoaded: false, session: null });
    mocks.useAuth.mockReturnValue({ isLoaded: true, isSignedIn: false });
    expect(useSession()).toEqual({ isLoaded: true, session: null });
  });
});
