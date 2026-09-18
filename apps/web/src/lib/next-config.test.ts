import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("web next.config", () => {
  it("composes MDX page support into the final config", () => {
    expect(nextConfig.pageExtensions).toEqual(
      expect.arrayContaining(["md", "mdx", "ts", "tsx"])
    );
  });

  it("defines redirects for /sign-in, /login, /sign-up, and /register", async () => {
    expect(nextConfig.redirects).toBeDefined();
    if (!nextConfig.redirects) {
      return;
    }

    const redirects = await nextConfig.redirects();
    expect(redirects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          permanent: false,
          source: "/sign-in",
        }),
        expect.objectContaining({
          permanent: false,
          source: "/login",
        }),
        expect.objectContaining({
          permanent: false,
          source: "/sign-up",
        }),
        expect.objectContaining({
          permanent: false,
          source: "/register",
        }),
      ])
    );

    const signInRedirect = redirects.find((r) => r.source === "/sign-in");
    const loginRedirect = redirects.find((r) => r.source === "/login");
    const signUpRedirect = redirects.find((r) => r.source === "/sign-up");
    const registerRedirect = redirects.find((r) => r.source === "/register");

    expect(signInRedirect?.destination).toContain("/sign-in");
    expect(loginRedirect?.destination).toContain("/sign-in");
    expect(signUpRedirect?.destination).toContain("/sign-up");
    expect(registerRedirect?.destination).toContain("/sign-up");
  });
});
