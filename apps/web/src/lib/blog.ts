import type { MDXContent } from "mdx/types";
import { z } from "zod";
import {
  type BlogRegistryEntry,
  blogPostRegistry,
} from "@/src/content/blog/posts";

const calendarDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const blogDateFormatter = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
  year: "numeric",
});

const calendarDate = z
  .string()
  .regex(calendarDatePattern)
  .refine(
    (value) => {
      const parsed = new Date(`${value}T00:00:00.000Z`);
      return (
        !Number.isNaN(parsed.getTime()) &&
        parsed.toISOString().startsWith(value)
      );
    },
    { message: "must be a real YYYY-MM-DD calendar date" }
  );

const blogMetadataSchema = z
  .object({
    author: z.string().trim().min(1).max(80),
    authorRole: z.string().trim().min(1).max(120),
    category: z.enum(["guide", "update"]),
    description: z.string().trim().min(1).max(280),
    featured: z.boolean().default(false),
    publishedAt: calendarDate,
    regions: z.array(z.enum(["AU", "NZ", "UK"])).min(1),
    status: z.enum(["draft", "published"]),
    title: z.string().trim().min(1).max(120),
    updatedAt: calendarDate.optional(),
  })
  .strict()
  .superRefine((metadata, context) => {
    if (metadata.updatedAt && metadata.updatedAt < metadata.publishedAt) {
      context.addIssue({
        code: "custom",
        message: "cannot predate publishedAt",
        path: ["updatedAt"],
      });
    }
  });

export type BlogPostMetadata = z.infer<typeof blogMetadataSchema>;

export interface BlogPost extends BlogPostMetadata {
  readonly Component: MDXContent;
  readonly slug: string;
}

export type BlogPostSummary = Omit<BlogPost, "Component">;

const comparePosts = (left: BlogPost, right: BlogPost): number => {
  const dateOrder = right.publishedAt.localeCompare(left.publishedAt);
  return dateOrder === 0 ? left.slug.localeCompare(right.slug) : dateOrder;
};

const parseMetadata = (slug: string, metadata: unknown): BlogPostMetadata => {
  const result = blogMetadataSchema.safeParse(metadata);

  if (result.success) {
    return result.data;
  }

  const [issue] = result.error.issues;
  const field = issue?.path.join(".") || "metadata";
  throw new Error(
    `Invalid blog metadata for "${slug}" at "${field}": ${issue?.message ?? "unknown validation error"}`
  );
};

export const parseBlogRegistry = (
  entries: readonly BlogRegistryEntry[]
): readonly BlogPost[] => {
  const slugs = new Set<string>();
  const posts = entries.map((entry) => {
    if (slugs.has(entry.slug)) {
      throw new Error(`Duplicate blog slug: "${entry.slug}"`);
    }

    slugs.add(entry.slug);
    return {
      Component: entry.Component,
      slug: entry.slug,
      ...parseMetadata(entry.slug, entry.metadata),
    };
  });

  const featuredPublished = posts.filter(
    (post) => post.status === "published" && post.featured
  );
  if (featuredPublished.length > 1) {
    throw new Error(
      `Only one published blog post may be featured; found ${featuredPublished.length}`
    );
  }

  return posts.sort(comparePosts);
};

const catalogue = parseBlogRegistry(blogPostRegistry);

export const formatBlogDate = (value: string): string =>
  blogDateFormatter.format(new Date(`${value}T00:00:00.000Z`));

const withoutComponent = ({ Component: _component, ...post }: BlogPost) => post;

export const getAllPosts = (): readonly BlogPostSummary[] =>
  catalogue.filter((post) => post.status === "published").map(withoutComponent);

export const getPost = (slug: string): BlogPost | null =>
  catalogue.find((post) => post.status === "published" && post.slug === slug) ??
  null;

export const getRelatedPosts = (
  slug: string,
  limit = 2
): readonly BlogPostSummary[] => {
  const current = getPost(slug);
  if (!current || limit <= 0) {
    return [];
  }

  return catalogue
    .filter((post) => post.status === "published" && post.slug !== slug)
    .sort((left, right) => {
      const leftCategory = left.category === current.category ? 0 : 1;
      const rightCategory = right.category === current.category ? 0 : 1;
      return leftCategory - rightCategory || comparePosts(left, right);
    })
    .slice(0, limit)
    .map(withoutComponent);
};
