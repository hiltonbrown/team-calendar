import { resolveCanonicalWebUrl } from "@repo/seo/canonical-url";
import { getAllPosts } from "@/src/lib/blog";

const feedTitle = "Team Calendar guides";
const feedDescription =
  "Practical guides to Xero Payroll leave, secure calendar feeds and dependable team availability.";

export const dynamic = "force-static";

export const escapeXml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const toRfc822Date = (value: string): string =>
  new Date(`${value}T00:00:00.000Z`).toUTCString();

export const GET = (): Response => {
  const baseUrl = resolveCanonicalWebUrl();
  const feedUrl = new URL("/rss.xml", baseUrl).href;
  const items = getAllPosts()
    .map((post) => {
      const postUrl = new URL(`/blog/${post.slug}`, baseUrl).href;

      return [
        "<item>",
        `<title>${escapeXml(post.title)}</title>`,
        `<link>${escapeXml(postUrl)}</link>`,
        `<guid isPermaLink="true">${escapeXml(postUrl)}</guid>`,
        `<description>${escapeXml(post.description)}</description>`,
        `<category>${escapeXml(post.category)}</category>`,
        `<author>${escapeXml(post.author)}</author>`,
        `<pubDate>${toRfc822Date(post.publishedAt)}</pubDate>`,
        "</item>",
      ].join("");
    })
    .join("");

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "<channel>",
    `<title>${feedTitle}</title>`,
    `<description>${feedDescription}</description>`,
    `<link>${escapeXml(new URL("/blog", baseUrl).href)}</link>`,
    `<atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />`,
    "<language>en-AU</language>",
    items,
    "</channel>",
    "</rss>",
  ].join("");

  return new Response(xml, {
    headers: {
      "Cache-Control": "public, max-age=0, s-maxage=3600",
      "Content-Type": "application/rss+xml; charset=utf-8",
    },
  });
};
