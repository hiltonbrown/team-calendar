import { AuthFormFrame } from "@repo/auth/components/auth-form-frame";
import { chooseOrganizationTaskRedirectUrl } from "@repo/auth/components/choose-organization-task";
import { embeddedAuthAppearance } from "@repo/auth/components/embedded-auth-appearance";
import { signInCopy } from "@repo/auth/components/sign-in";
import { signUpCopy } from "@repo/auth/components/sign-up";
import { chooseOrganizationTaskUrl } from "@repo/auth/provider";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("auth components", () => {
  it("routes Clerk organisation session tasks to the app task page", () => {
    expect(chooseOrganizationTaskUrl).toBe(
      "/session-tasks/choose-organization"
    );
  });

  it("adds visible sign-in context to the shared auth form frame", () => {
    render(
      <AuthFormFrame {...signInCopy}>
        <div data-testid="embedded-clerk-form" />
      </AuthFormFrame>
    );

    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeDefined();
    expect(
      screen.getByText(
        "Sign in to manage leave and availability for your organisation."
      )
    ).toBeDefined();
    expect(screen.getByTestId("embedded-clerk-form")).toBeDefined();
  });

  it("guides public sign-up towards organisation onboarding and invitations", () => {
    render(
      <AuthFormFrame {...signUpCopy}>
        <div data-testid="embedded-clerk-form" />
      </AuthFormFrame>
    );

    expect(
      screen.getByRole("heading", { name: "Create your organisation" })
    ).toBeDefined();
    expect(
      screen.getByText(
        "Start a new LeaveSync organisation, or accept an invitation from your team email."
      )
    ).toBeDefined();
  });

  it("keeps Clerk's duplicate embedded header hidden", () => {
    expect(embeddedAuthAppearance.elements.header).toBe("hidden");
  });

  it("completes the Clerk organisation task back into the app", () => {
    expect(chooseOrganizationTaskRedirectUrl).toBe("/");
  });
});
