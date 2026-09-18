import { beforeEach, describe, expect, it, vi } from "vitest";

const getAllPosts = vi.hoisted(() => vi.fn());

vi.mock("@/src/lib/blog", () => ({ getAllPosts }));

describe("Blog RSS feed", () => {
  beforeEach(() => {
    getAllPosts.mockReturnValue([
      {
        author: "Team & Calendar",
        category: "guide",
        description: "Use <secure> feeds.",
        publishedAt: "2026-02-20",
        slug: "secure-feeds",
        title: "Feeds & calendars",
      },
    ]);
  });

  it("returns escaped, discoverable RSS in catalogue order", async () => {
    const { GET } = await import("./route");
    const response = GET();
    const xml = await response.text();

    expect(response.headers.get("content-type")).toBe(
      "application/rss+xml; charset=utf-8"
    );
    expect(xml).toContain("<language>en-AU</language>");
    expect(xml).toContain("Feeds &amp; calendars");
    expect(xml).toContain("Use &lt;secure&gt; feeds.");
    expect(xml).toContain("Team &amp; Calendar");
    expect(xml).toContain("Fri, 20 Feb 2026 00:00:00 GMT");
    expect(xml).toContain('rel="self" type="application/rss+xml"');
  });
});
