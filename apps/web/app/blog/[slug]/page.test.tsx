import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NOT_FOUND");
  })
);
const getPost = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/src/lib/blog", () => ({
  formatBlogDate: (value: string) => value,
  getAllPosts: () => [{ slug: "secure-feeds" }],
  getPost,
  getRelatedPosts: () => [],
}));

import BlogPostPage, { generateMetadata, generateStaticParams } from "./page";

const post = {
  author: "Team Calendar",
  authorRole: "Product team, Gold Coast",
  Component: () => React.createElement("p", null, "Article body"),
  category: "guide",
  description: "A secure calendar feed guide.",
  featured: true,
  publishedAt: "2026-02-20",
  regions: ["AU"],
  slug: "secure-feeds",
  status: "published",
  title: "Secure calendar feeds",
};

describe("Blog article route", () => {
  it("renders a published article with one focusable main", async () => {
    getPost.mockReturnValue(post);

    const html = renderToStaticMarkup(
      await BlogPostPage({ params: Promise.resolve({ slug: post.slug }) })
    );

    expect(html.match(/<main\b/g)).toHaveLength(1);
    expect(html).toContain('id="blog-main"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain("Article body");
    expect(html).toContain("Written by Team Calendar");
  });

  it("generates only published static routes and article metadata", async () => {
    getPost.mockReturnValue(post);

    expect(generateStaticParams()).toEqual([{ slug: "secure-feeds" }]);
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: post.slug }),
    });

    expect(metadata.title).toContain("Secure calendar feeds");
    expect(metadata.alternates?.canonical).toContain("/blog/secure-feeds");
    expect(metadata.openGraph).toMatchObject({ type: "article" });
  });

  it("uses the not-found boundary for an unknown slug", async () => {
    getPost.mockReturnValue(null);

    await expect(
      BlogPostPage({ params: Promise.resolve({ slug: "unknown" }) })
    ).rejects.toThrow("NOT_FOUND");
    expect(notFound).toHaveBeenCalledOnce();
  });
});
