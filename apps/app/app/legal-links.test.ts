import fs from "node:fs";
import path from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AuthLayout from "./(unauthenticated)/(auth)/layout";

vi.mock("@/components/brand/brand-panel", () => ({
  BrandPanel: () => null,
  MobileBrand: () => null,
}));
vi.mock("@repo/design-system/components/mode-toggle", () => ({
  ModeToggle: () => null,
}));
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("legal link destinations", () => {
  it.each([
    "https://teamcalendar.online",
    "https://candidate-web.vercel.app",
    "http://localhost:3001",
  ])(
    "renders auth legal links on the configured web origin %s",
    (webOrigin) => {
      vi.stubEnv("NEXT_PUBLIC_WEB_URL", webOrigin);
      render(AuthLayout({ children: null }));
      expect(
        screen
          .getByRole("link", { name: "Privacy policy" })
          .getAttribute("href")
      ).toBe(`${webOrigin}/privacy-policy`);
      expect(
        screen
          .getByRole("link", { name: "Terms of service" })
          .getAttribute("href")
      ).toBe(`${webOrigin}/terms-of-service`);
    }
  );
  it("verifies target legal routes exist in apps/web", () => {
    expect(
      fs.existsSync(
        path.resolve(
          import.meta.dirname,
          "../../web/app/(legal)/privacy-policy/page.tsx"
        )
      )
    ).toBe(true);
    expect(
      fs.existsSync(
        path.resolve(
          import.meta.dirname,
          "../../web/app/(legal)/terms-of-service/page.tsx"
        )
      )
    ).toBe(true);
  });
});
