import { AccountUserMenu, SignOutButton } from "@repo/auth/client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  replace: vi.fn(),
  session: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("../../../packages/auth/adapters/better-auth-client", () => ({
  signOut: mocks.signOut,
  useActiveOrganization: () => ({ organization: { name: "Acme Account" } }),
  useSession: mocks.session,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace }),
}));

describe("account user controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockReturnValue({
      isLoaded: true,
      session: { role: "owner" },
      user: { email: "ada@example.test", image: null, name: "Ada Person" },
    });
    mocks.signOut.mockResolvedValue({ data: { success: true }, error: null });
  });
  it("keeps the user menu unavailable while the session is loading", () => {
    mocks.session.mockReturnValue({
      isLoaded: false,
      session: null,
      user: null,
    });
    render(<AccountUserMenu />);
    expect(
      screen
        .getByRole("button", { name: "Open user menu" })
        .hasAttribute("disabled")
    ).toBe(true);
  });
  it("signs out before replacing the route and refreshing server state", async () => {
    render(
      <SignOutButton>
        <button type="button">Sign out</button>
      </SignOutButton>
    );
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/sign-in"));
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
  it("keeps a failed sign-out visible and retryable", async () => {
    mocks.signOut.mockResolvedValue({
      data: null,
      error: { code: "NETWORK_ERROR" },
    });
    render(
      <SignOutButton>
        <button type="button">Sign out</button>
      </SignOutButton>
    );
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Could not sign out"
    );
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Sign out" }).hasAttribute("disabled")
    ).toBe(false);
  });
});
