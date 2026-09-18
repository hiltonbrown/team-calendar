import { describe, expect, it, vi } from "vitest";

const badPublishedDate = /bad-date.*publishedAt/i;
const badUpdatedDate = /bad-update.*updatedAt/i;
const multipleFeatured = /Only one published blog post may be featured/;

const fixtures = vi.hoisted(() => {
  const Component = () => null;
  const metadata = {
    author: "Team Calendar",
    authorRole: "Product team, Gold Coast",
    category: "guide",
    description: "A practical guide to Team Calendar.",
    featured: false,
    publishedAt: "2026-01-10",
    regions: ["AU"],
    status: "published",
    title: "A practical guide",
  };

  return {
    Component,
    metadata,
    registry: [
      {
        Component,
        metadata: {
          ...metadata,
          featured: true,
          publishedAt: "2026-02-20",
          title: "Featured guide",
        },
        slug: "featured-guide",
      },
      {
        Component,
        metadata: { ...metadata, title: "Second guide" },
        slug: "second-guide",
      },
      {
        Component,
        metadata: {
          ...metadata,
          category: "update",
          title: "Launch update",
        },
        slug: "launch-update",
      },
      {
        Component,
        metadata: { ...metadata, status: "draft", title: "Draft guide" },
        slug: "draft-guide",
      },
    ],
  };
});

vi.mock("@/src/content/blog/posts", () => ({
  blogPostRegistry: fixtures.registry,
}));

import {
  getAllPosts,
  getPost,
  getRelatedPosts,
  parseBlogRegistry,
} from "./blog";

describe("blog catalogue", () => {
  it("validates required metadata with slug and field context", () => {
    const invalidFields = [
      "title",
      "description",
      "author",
      "authorRole",
      "category",
      "status",
      "publishedAt",
      "regions",
    ] as const;

    for (const field of invalidFields) {
      const metadata: Record<string, unknown> = { ...fixtures.metadata };
      delete metadata[field];

      expect(() =>
        parseBlogRegistry([
          { Component: fixtures.Component, metadata, slug: `missing-${field}` },
        ])
      ).toThrow(new RegExp(`missing-${field}.*${field}`, "i"));
    }
  });

  it("requires real YYYY-MM-DD dates and non-earlier updates", () => {
    expect(() =>
      parseBlogRegistry([
        {
          Component: fixtures.Component,
          metadata: { ...fixtures.metadata, publishedAt: "20 February 2026" },
          slug: "bad-date",
        },
      ])
    ).toThrow(badPublishedDate);

    expect(() =>
      parseBlogRegistry([
        {
          Component: fixtures.Component,
          metadata: {
            ...fixtures.metadata,
            publishedAt: "2026-02-20",
            updatedAt: "2026-02-19",
          },
          slug: "bad-update",
        },
      ])
    ).toThrow(badUpdatedDate);
  });

  it("sorts published posts by date then slug and excludes drafts", () => {
    expect(getAllPosts().map((post) => post.slug)).toEqual([
      "featured-guide",
      "launch-update",
      "second-guide",
    ]);
    expect(getAllPosts().some((post) => post.slug === "draft-guide")).toBe(
      false
    );
  });

  it("uses explicit feature metadata and rejects multiple featured posts", () => {
    expect(getAllPosts().filter((post) => post.featured)).toHaveLength(1);

    expect(() =>
      parseBlogRegistry([
        {
          Component: fixtures.Component,
          metadata: { ...fixtures.metadata, featured: true },
          slug: "one",
        },
        {
          Component: fixtures.Component,
          metadata: { ...fixtures.metadata, featured: true },
          slug: "two",
        },
      ])
    ).toThrow(multipleFeatured);
  });

  it("returns null for unknown or draft slugs without filesystem access", () => {
    expect(getPost("unknown")).toBeNull();
    expect(getPost("draft-guide")).toBeNull();
  });

  it("prefers related posts in the same category and caps the result", () => {
    expect(
      getRelatedPosts("featured-guide", 2).map((post) => post.slug)
    ).toEqual(["second-guide", "launch-update"]);
    expect(getRelatedPosts("featured-guide", 1)).toHaveLength(1);
  });
});
