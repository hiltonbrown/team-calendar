import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const packageRoot = resolve(import.meta.dirname, "..");
const repositoryRoot = resolve(packageRoot, "../..");

describe("public design-system provider boundary", () => {
  it("keeps auth out of the public provider module", () => {
    const source = readFileSync(
      resolve(import.meta.dirname, "public.tsx"),
      "utf8"
    );
    expect(source).not.toContain("@repo/auth");
    expect(source).not.toContain("AuthProvider");
    expect(source).toContain("ThemeProvider");
    expect(source).toContain("TooltipProvider");
    expect(source).toContain("Toaster");
  });

  it("points the public web layout at the auth-free export", () => {
    const layout = readFileSync(
      resolve(repositoryRoot, "apps/web/app/layout.tsx"),
      "utf8"
    );
    const manifest = JSON.parse(
      readFileSync(resolve(repositoryRoot, "apps/web/package.json"), "utf8")
    ) as { dependencies: Record<string, string> };
    expect(layout).toContain("@repo/design-system/providers/public");
    expect(layout).not.toContain("auth={false}");
    expect(manifest.dependencies).not.toHaveProperty("@clerk/nextjs");
  });
});
