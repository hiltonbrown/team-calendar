import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ForgotPasswordForm,
  MagicLinkForm,
  ResetPasswordForm,
  SignInForm,
  SignUpForm,
  VerifyEmailForm,
} from "./auth-forms";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  replace: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
  sendVerificationEmail: vi.fn(),
  signInEmail: vi.fn(),
  signInMagicLink: vi.fn(),
  signInSocial: vi.fn(),
  signUpEmail: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace }),
}));
vi.mock("@repo/auth/client", () => ({
  ...mocks,
  safeAuthReturnTo: (value: string | null | undefined, fallback = "/") =>
    value?.startsWith("/") && !value.startsWith("//") ? value : fallback,
}));

const enter = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label, { exact: true }), {
    target: { value },
  });
const submit = (name: string) =>
  fireEvent.submit(screen.getByRole("form", { name }));

beforeEach(() => {
  vi.resetAllMocks();
  for (const method of [
    mocks.signInEmail,
    mocks.signUpEmail,
    mocks.sendVerificationEmail,
    mocks.requestPasswordReset,
    mocks.resetPassword,
    mocks.signInMagicLink,
    mocks.signInSocial,
  ]) {
    method.mockResolvedValue({ data: {}, error: null });
  }
});
afterEach(() => vi.unstubAllEnvs());

describe("email sign-in", () => {
  it("validates fields before making an auth request", async () => {
    render(<SignInForm />);
    submit("Sign in with email");
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Check the highlighted fields"
    );
    expect(
      screen.getByLabelText("Email address").getAttribute("aria-invalid")
    ).toBe("true");
    expect(mocks.signInEmail).not.toHaveBeenCalled();
  });
  it("uses the neutral client and a safe account-picker destination", async () => {
    render(<SignInForm returnTo="/calendar?view=week" />);
    enter("Email address", "person@example.test");
    enter("Password", "correct horse battery staple");
    submit("Sign in with email");
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith(
        "/select-account?returnTo=%2Fcalendar%3Fview%3Dweek"
      )
    );
    expect(mocks.signInEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "person@example.test",
        password: "correct horse battery staple",
      })
    );
  });
  it("keeps input and renders a safe error without provider details", async () => {
    mocks.signInEmail.mockResolvedValue({
      error: {
        code: "INVALID_EMAIL_OR_PASSWORD",
        message: "private-provider-token-canary",
      },
    });
    render(<SignInForm />);
    enter("Email address", "person@example.test");
    enter("Password", "incorrect password");
    submit("Sign in with email");
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Check your email address and password"
    );
    expect(document.body.textContent).not.toContain(
      "private-provider-token-canary"
    );
    expect(screen.getByLabelText("Email address")).toMatchObject({
      value: "person@example.test",
    });
  });
  it("blocks duplicate requests while a sign-in is pending", async () => {
    let finish: ((result: { error: null }) => void) | undefined;
    mocks.signInEmail.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    render(<SignInForm />);
    enter("Email address", "person@example.test");
    enter("Password", "correct horse battery staple");
    submit("Sign in with email");
    submit("Sign in with email");
    expect(mocks.signInEmail).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Sign in" }).getAttribute("aria-busy")
    ).toBe("true");
    finish?.({ error: null });
    await waitFor(() => expect(mocks.replace).toHaveBeenCalled());
  });
  it.each([
    ["Google", "google"],
    ["Microsoft", "microsoft"],
    ["Xero", "xero-auth"],
  ])("starts %s using the neutral social method", async (label, provider) => {
    render(<SignInForm returnTo="https://untrusted.example/path" />);
    fireEvent.click(
      screen.getByRole("button", { name: `Continue with ${label}` })
    );
    await waitFor(() =>
      expect(mocks.signInSocial).toHaveBeenCalledWith(
        expect.objectContaining({
          callbackURL: "/select-account?returnTo=%2F",
          provider,
        })
      )
    );
  });
});

describe("signup and mailbox verification", () => {
  it("requires the configured password length and retains a password containing spaces", async () => {
    render(<SignUpForm />);
    enter("Full name", "A Person");
    enter("Email address", "person@example.test");
    enter("Password", "short");
    submit("Create your Account");
    expect((await screen.findByRole("alert")).textContent).toContain(
      "at least 12 characters"
    );
    expect(mocks.signUpEmail).not.toHaveBeenCalled();
    enter("Password", "a password with spaces");
    submit("Create your Account");
    await waitFor(() =>
      expect(mocks.signUpEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "person@example.test",
          name: "A Person",
          password: "a password with spaces",
        })
      )
    );
    expect(mocks.replace).toHaveBeenCalledWith("/verify-email?sent=1");
  });
  it("resends verification with a sign-in callback and a generic confirmation", async () => {
    render(<VerifyEmailForm />);
    enter("Email address", "person@example.test");
    submit("Resend verification email");
    expect((await screen.findByRole("status")).textContent).toContain(
      "Check your email"
    );
    expect(mocks.sendVerificationEmail).toHaveBeenCalledWith({
      callbackURL: "/sign-in?returnTo=%2F&verified=1",
      email: "person@example.test",
    });
  });
});

describe("recovery and magic links", () => {
  it("sends password recovery to the reset page without revealing account existence", async () => {
    render(<ForgotPasswordForm />);
    enter("Email address", "person@example.test");
    submit("Request a password reset");
    expect((await screen.findByRole("status")).textContent).toContain(
      "If a password can be reset for this address"
    );
    expect(mocks.requestPasswordReset).toHaveBeenCalledWith({
      email: "person@example.test",
      redirectTo: "/reset-password",
    });
  });
  it("requires a usable reset link and provides a recovery path", () => {
    render(<ResetPasswordForm />);
    expect(screen.getByRole("alert").textContent).toContain(
      "Request a new password reset link"
    );
    expect(
      screen
        .getByRole("link", { name: "Request a new link" })
        .getAttribute("href")
    ).toBe("/forgot-password");
    expect(screen.queryByLabelText("New password")).toBeNull();
  });
  it("checks matching passwords, submits only the token and new password, and removes the token from the URL", async () => {
    render(<ResetPasswordForm token="private-reset-token-canary" />);
    enter("New password", "correct horse battery staple");
    enter("Confirm new password", "different long password");
    submit("Reset your password");
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Passwords must match"
    );
    expect(mocks.resetPassword).not.toHaveBeenCalled();
    enter("Confirm new password", "correct horse battery staple");
    submit("Reset your password");
    expect((await screen.findByRole("status")).textContent).toContain(
      "Your password has been reset"
    );
    expect(mocks.resetPassword).toHaveBeenCalledWith({
      newPassword: "correct horse battery staple",
      token: "private-reset-token-canary",
    });
    expect(mocks.replace).toHaveBeenCalledWith("/reset-password?complete=1");
    expect(document.body.textContent).not.toContain(
      "private-reset-token-canary"
    );
  });
  it("sends a magic link with a safe account-picker callback", async () => {
    render(<MagicLinkForm returnTo="/notifications" />);
    enter("Email address", "person@example.test");
    submit("Email a sign-in link");
    expect((await screen.findByRole("status")).textContent).toContain(
      "five minutes"
    );
    expect(mocks.signInMagicLink).toHaveBeenCalledWith({
      callbackURL: "/select-account?returnTo=%2Fnotifications",
      email: "person@example.test",
    });
  });
  it("shows an actionable error on network failure", async () => {
    mocks.requestPasswordReset.mockRejectedValue(
      new Error("private-network-canary")
    );
    render(<ForgotPasswordForm />);
    enter("Email address", "person@example.test");
    submit("Request a password reset");
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Please try again"
    );
    expect(document.body.textContent).not.toContain("private-network-canary");
  });
});
