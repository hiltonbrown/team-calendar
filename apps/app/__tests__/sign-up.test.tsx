import { signUpCopy } from "@repo/auth/components/sign-up";
import { brandNameDisplay } from "@repo/seo/branding";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  beforeEach(() => {
    redirect.mockClear();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_LAUNCH_MODE", "early_access");
    vi.stubEnv("NEXT_PUBLIC_WEB_URL", "http://localhost:3001");
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it.each(["early_access", "paid", undefined])(
    "renders the sign-up form in production with launch mode %s",
    async (launchMode) => {
      vi.stubEnv("NEXT_PUBLIC_LAUNCH_MODE", launchMode);
      const { findByTestId } = render(<Page />);
      expect(await findByTestId("sign-up-component")).toBeDefined();
      expect(redirect).not.toHaveBeenCalled();
    }
  );

  it("renders the sign-up form in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { findByTestId } = render(<Page />);
    expect(await findByTestId("sign-up-component")).toBeDefined();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("exports metadata aligned with canonical sign-up copy", () => {
    expect(metadata.title).toBe(`${signUpCopy.title} | ${brandNameDisplay}`);
    expect(metadata.description).toBe(signUpCopy.description);
  });
});
