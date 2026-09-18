import { resolveCanonicalWebUrl } from "@repo/seo/canonical-url";
import type { MetadataRoute } from "next";
import { env } from "@/env";
import { getAllPosts } from "@/src/lib/blog";

export const publicRoutes = [
  "/",
  "/about",
  "/blog",
  "/careers",
  "/changelog",
  "/contact",
  "/customers",
  "/features",
  "/help-centre",
  "/help-centre/onboarding",
  "/integrations",
  "/pricing",
  "/privacy-policy",
  "/security",
  "/status",
  "/terms-of-service",
] as const;

const sitemap = (): MetadataRoute.Sitemap => {
  const url = resolveCanonicalWebUrl({
    vercelProjectProductionUrl: env.VERCEL_PROJECT_PRODUCTION_URL,
    webUrl: env.NEXT_PUBLIC_WEB_URL,
  });
  const blogs = getAllPosts();

  return [
    ...publicRoutes.map((route) => ({
      url: new URL(route, url).href,
    })),
    ...blogs.map((post) => ({
      lastModified: new Date(
        `${post.updatedAt ?? post.publishedAt}T00:00:00.000Z`
      ),
      url: new URL(`/blog/${post.slug}`, url).href,
    })),
  ];
};

export default sitemap;
