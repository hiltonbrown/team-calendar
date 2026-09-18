import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_WEB_URL: "https://teamcalendar.online",
    VERCEL_PROJECT_PRODUCTION_URL: undefined,
  },
}));

vi.mock("@/src/lib/blog", () => ({
  getAllPosts: vi.fn(() => [
    {
      publishedAt: "2026-02-20",
      slug: "launch-note",
      updatedAt: "2026-03-02",
    },
  ]),
}));

describe("public sitemap", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("publishes both help routes once without implementation directories", async () => {
    const { default: sitemap } = await import("./sitemap");
    const entries = await sitemap();
    const paths = entries.map((entry) => new URL(entry.url).pathname);

    expect(paths.filter((path) => path === "/help-centre")).toHaveLength(1);
    expect(
      paths.filter((path) => path === "/help-centre/onboarding")
    ).toHaveLength(1);
    expect(paths).not.toContain("/help-centre/components");
    expect(paths).toContain("/blog/launch-note");

    const publicEntry = entries.find((entry) => entry.url.endsWith("/about"));
    const blogEntry = entries.find((entry) =>
      entry.url.endsWith("/blog/launch-note")
    );

    expect(publicEntry?.lastModified).toBeUndefined();
    expect(blogEntry?.lastModified).toEqual(
      new Date("2026-03-02T00:00:00.000Z")
    );
  });
});
