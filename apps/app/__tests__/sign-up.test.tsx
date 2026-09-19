import { signUpCopy } from "@repo/auth/components/sign-up";
import { brandNameDisplay } from "@repo/seo/branding";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const redirect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect }));

import Page, {
  metadata,
} from "../app/(unauthenticated)/(auth)/sign-up/[[...sign-up]]/page";

vi.mock("@repo/auth/components/sign-up", () => ({
  SignUp: () => <div data-testid="sign-up-component" />,
  signUpCopy: {
    description:
      "Start a new Team Calendar organisation, or accept an invitation from your team email.",
    title: "Create your organisation",
  },
}));

describe("Sign Up Page", () => {
  it("renders sign-up only for an application invitation", async () => {
    const page = await Page({
      searchParams: Promise.resolve({ __clerk_ticket: "ticket" }),
    });
    const { container } = render(page);
    expect(container).toBeDefined();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirects direct uninvited sign-up to the application", async () => {
    await Page({ searchParams: Promise.resolve({}) });
    expect(redirect).toHaveBeenCalledWith(
      expect.stringContaining("/contact?admission=required")
    );
  });

  it("exports metadata aligned with canonical sign-up copy", () => {
    expect(metadata.title).toBe(`${signUpCopy.title} | ${brandNameDisplay}`);
    expect(metadata.description).toBe(signUpCopy.description);
  });
});
