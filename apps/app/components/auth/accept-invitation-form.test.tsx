import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AcceptInvitationForm } from "./accept-invitation-form";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace }),
}));
const invitationId = "88a9b00c-a931-4d6b-88ea-113ea8c6d54f";
const view = () =>
  render(
    <AcceptInvitationForm
      email="person@example.test"
      invitationId={invitationId}
    />
  );
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(() => vi.unstubAllGlobals());

describe("Account invitation form", () => {
  it("accepts through the controlled same-origin route and refreshes authorisation", async () => {
    mocks.fetch.mockResolvedValue(Response.json({ accountId: "account" }));
    view();
    fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/"));
    expect(mocks.fetch).toHaveBeenCalledWith(
      `/api/auth/account-invitations/${invitationId}/accept`,
      { credentials: "same-origin", method: "POST" }
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
  it("retains the addressed invitation when signing in with another email", () => {
    view();
    const destination = new URL(
      screen
        .getByRole("link", { name: "Use a different email" })
        .getAttribute("href") ?? "",
      "http://localhost:3000"
    );
    expect(destination.pathname).toBe("/sign-in");
    expect(destination.searchParams.get("invitationId")).toBe(invitationId);
    expect(destination.searchParams.get("returnTo")).toBe(
      `/accept-invitation/${invitationId}`
    );
  });
  it("announces an expired session without navigating away", async () => {
    mocks.fetch.mockResolvedValue(new Response(null, { status: 401 }));
    view();
    fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Sign in again"
    );
    expect(mocks.replace).not.toHaveBeenCalled();
  });
  it("keeps the action retryable after a network failure", async () => {
    mocks.fetch
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(Response.json({ accountId: "account" }));
    view();
    fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Check your connection"
    );
    const retry = screen.getByRole("button", { name: "Accept invitation" });
    expect(retry.hasAttribute("disabled")).toBe(false);
    fireEvent.click(retry);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/"));
  });
});
