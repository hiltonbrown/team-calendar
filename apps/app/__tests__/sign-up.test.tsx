import { brandNameDisplay } from "@repo/seo/branding";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Page, {
  metadata,
} from "../app/(unauthenticated)/(auth)/sign-up/[[...sign-up]]/page";
import { authCopy } from "../components/auth/auth-copy";

vi.mock("@/components/auth/auth-forms", () => ({
  SignUpForm: ({ invitationId }: { invitationId?: string }) => (
    <div data-invitation={invitationId} data-testid="sign-up-form" />
  ),
}));

describe("sign-up page", () => {
  it("renders the custom public signup form", async () => {
    render(await Page({ searchParams: Promise.resolve({}) }));
    expect(screen.getByTestId("sign-up-form")).toBeDefined();
  });
  it("passes invitation context without accepting ambiguous duplicate values", async () => {
    render(
      await Page({
        searchParams: Promise.resolve({ invitationId: ["first", "second"] }),
      })
    );
    expect(
      screen.getByTestId("sign-up-form").dataset.invitation
    ).toBeUndefined();
  });
  it("uses the canonical page copy for metadata", () => {
    expect(metadata.title).toBe(
      `${authCopy.signUp.title} | ${brandNameDisplay}`
    );
    expect(metadata.description).toBe(authCopy.signUp.description);
  });
});
