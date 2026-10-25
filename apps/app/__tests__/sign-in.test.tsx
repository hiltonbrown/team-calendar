import { brandNameDisplay } from "@repo/seo/branding";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Page, {
  metadata,
} from "../app/(unauthenticated)/(auth)/sign-in/[[...sign-in]]/page";
import { authCopy } from "../components/auth/auth-copy";

vi.mock("@/components/auth/auth-forms", () => ({
  SignInForm: ({
    returnTo,
    verified,
  }: {
    returnTo?: string;
    verified?: boolean;
  }) => (
    <div
      data-return-to={returnTo}
      data-testid="sign-in-form"
      data-verified={String(verified)}
    />
  ),
}));

describe("sign-in page", () => {
  it("renders the custom form and forwards only scalar route parameters", async () => {
    render(
      await Page({
        searchParams: Promise.resolve({ returnTo: "/calendar", verified: "1" }),
      })
    );
    expect(screen.getByTestId("sign-in-form").dataset.returnTo).toBe(
      "/calendar"
    );
    expect(screen.getByTestId("sign-in-form").dataset.verified).toBe("true");
  });
  it("uses the canonical page copy for metadata", () => {
    expect(metadata.title).toBe(
      `${authCopy.signIn.title} | ${brandNameDisplay}`
    );
    expect(metadata.description).toBe(authCopy.signIn.description);
  });
});
