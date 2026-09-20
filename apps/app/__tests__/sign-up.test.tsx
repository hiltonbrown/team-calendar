import { signUpCopy } from "@repo/auth/components/sign-up";
import { brandNameDisplay } from "@repo/seo/branding";
import { render } from "@testing-library/react";
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
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NEXT_PUBLIC_LAUNCH_MODE", "early_access");
    vi.stubEnv("NEXT_PUBLIC_WEB_URL", "http://localhost:3001");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders sign-up for an application invitation in early access", async () => {
    const page = await Page({
      searchParams: Promise.resolve({ __clerk_ticket: "ticket_123" }),
    });
    const { container } = render(page);
    expect(container).toBeDefined();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirects direct uninvited sign-up to the application in early access", async () => {
    await Page({ searchParams: Promise.resolve({}) });
    expect(redirect).toHaveBeenCalledWith(
      "http://localhost:3001/contact?admission=required"
    );
  });

  it("treats empty or whitespace invitation ticket as uninvited in early access", async () => {
    await Page({ searchParams: Promise.resolve({ __clerk_ticket: "   " }) });
    expect(redirect).toHaveBeenCalledWith(
      "http://localhost:3001/contact?admission=required"
    );
  });

  it("allows direct sign-up without invitation ticket in development mode", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const page = await Page({ searchParams: Promise.resolve({}) });
    const { container } = render(page);
    expect(container).toBeDefined();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("allows direct sign-up without invitation ticket in paid launch mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_LAUNCH_MODE", "paid");
    const page = await Page({ searchParams: Promise.resolve({}) });
    const { container } = render(page);
    expect(container).toBeDefined();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("safely normalises trailing slash in NEXT_PUBLIC_WEB_URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_WEB_URL", "https://teamcalendar.online/");
    await Page({ searchParams: Promise.resolve({}) });
    expect(redirect).toHaveBeenCalledWith(
      "https://teamcalendar.online/contact?admission=required"
    );
  });

  it("exports metadata aligned with canonical sign-up copy", () => {
    expect(metadata.title).toBe(`${signUpCopy.title} | ${brandNameDisplay}`);
    expect(metadata.description).toBe(signUpCopy.description);
  });
});
