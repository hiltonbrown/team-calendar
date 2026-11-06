import { AccountPicker } from "@repo/auth/components/account-picker";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SelectAccountPage from "../app/(unauthenticated)/(auth)/select-account/page";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  refetch: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  select: vi.fn(),
  serverSession: vi.fn(),
  session: vi.fn(),
  user: vi.fn(),
}));
vi.mock("../../../packages/auth/adapters/better-auth-client", () => ({
  setActiveAccount: mocks.select,
  useListAccounts: mocks.list,
  useSession: mocks.session,
}));
vi.mock("@repo/auth/server", () => ({
  getCurrentUser: mocks.user,
  getSession: mocks.serverSession,
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
  useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace }),
}));
const accounts = [
  {
    countryCode: "AU",
    id: "a",
    name: "Acme Account",
    provisioningStatus: "ready",
  },
  {
    countryCode: "AU",
    id: "b",
    name: "Second Account",
    provisioningStatus: "ready",
  },
];

const firstAccount = /Acme Account/;
const secondAccount = /Second Account/;
const noAccount = /No account is available/;

describe("account selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockReturnValue({
      accounts,
      error: null,
      isLoaded: true,
      refetch: mocks.refetch,
    });
    mocks.session.mockReturnValue({
      isLoaded: true,
      session: { accountId: "a" },
    });
    mocks.select.mockResolvedValue({ data: { id: "b" }, error: null });
    mocks.serverSession.mockResolvedValue({ accountId: null, userId: "u" });
    mocks.user.mockResolvedValue({ emailVerified: true, id: "u" });
  });
  it("opens only the selected Account after server confirmation and refreshes routing", async () => {
    render(<AccountPicker returnTo="/calendar?view=week" />);
    fireEvent.click(screen.getByRole("button", { name: secondAccount }));
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/calendar?view=week")
    );
    expect(mocks.select).toHaveBeenCalledWith("b");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
  it("keeps the picker and offers a refresh when membership changed", async () => {
    mocks.select.mockResolvedValue({
      data: null,
      error: { code: "MEMBER_NOT_FOUND" },
    });
    render(<AccountPicker />);
    fireEvent.click(screen.getByRole("button", { name: secondAccount }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Your access may have changed"
    );
    expect(mocks.replace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Refresh accounts" }));
    expect(mocks.refetch).toHaveBeenCalledOnce();
  });
  it("explains missing memberships without creating an unrelated Account", () => {
    mocks.list.mockReturnValue({ accounts: [], error: null, isLoaded: true });
    render(<AccountPicker />);
    expect(screen.getByText(noAccount)).toBeDefined();
    expect(screen.getByRole("link", { name: "Back to sign in" })).toBeDefined();
    expect(mocks.select).not.toHaveBeenCalled();
  });
  it("selects a sole membership once when none is active", async () => {
    mocks.list.mockReturnValue({
      accounts: [accounts[0]],
      error: null,
      isLoaded: true,
    });
    mocks.session.mockReturnValue({
      isLoaded: true,
      session: { accountId: null },
    });
    render(<AccountPicker returnTo="https://untrusted.example" />);
    await waitFor(() => expect(mocks.select).toHaveBeenCalledOnce());
    expect(mocks.select).toHaveBeenCalledWith("a");
    expect(mocks.replace).toHaveBeenCalledWith("/");
  });
  it("keeps unfinished setup outside the product instead of switching repeatedly", () => {
    mocks.list.mockReturnValue({
      accounts: [{ ...accounts[0], provisioningStatus: "pending" }],
      error: null,
      isLoaded: true,
    });
    mocks.session.mockReturnValue({
      isLoaded: true,
      session: { accountId: null },
    });
    render(<AccountPicker />);
    expect(
      screen
        .getByRole("button", { name: firstAccount })
        .hasAttribute("disabled")
    ).toBe(true);
    expect(screen.getByRole("status").textContent).toContain(
      "still being set up"
    );
    expect(mocks.select).not.toHaveBeenCalled();
  });
  it("enforces a real session and verified email on the picker page", async () => {
    mocks.serverSession.mockResolvedValue(null);
    await expect(
      SelectAccountPage({
        searchParams: Promise.resolve({ returnTo: "/calendar" }),
      })
    ).rejects.toThrow("redirect:/sign-in?returnTo=%2Fcalendar");
    mocks.serverSession.mockResolvedValue({ accountId: null, userId: "u" });
    mocks.user.mockResolvedValue({ emailVerified: false, id: "u" });
    await expect(
      SelectAccountPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow("redirect:/verify-email");
  });
});
