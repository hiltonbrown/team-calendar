import { resolveCanonicalWebUrl } from "@repo/seo/canonical-url";
import type { Blog, WithContext } from "@repo/seo/json-ld";
import { JsonLd } from "@repo/seo/json-ld";
import { createMetadata } from "@repo/seo/metadata";
import { ArrowRight, Rss } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { formatBlogDate, getAllPosts } from "@/src/lib/blog";
import styles from "./blog.module.css";

const blogDescription =
  "Practical guides to Xero Payroll leave, secure calendar feeds and dependable team availability.";
const blogUrl = new URL("/blog", resolveCanonicalWebUrl()).href;

export const metadata: Metadata = createMetadata({
  alternates: {
    canonical: blogUrl,
    types: { "application/rss+xml": "/rss.xml" },
  },
  description: blogDescription,
  title: "Xero Payroll leave and calendar guides",
});

const BlogIndex = () => {
  const posts = getAllPosts();
  const jsonLd: WithContext<Blog> = {
    "@context": "https://schema.org",
    "@type": "Blog",
    blogPost: posts.map((post) => ({
      "@type": "BlogPosting",
      headline: post.title,
      url: new URL(`/blog/${post.slug}`, blogUrl).href,
    })),
    description: blogDescription,
    name: "Team Calendar guides",
    publisher: {
      "@type": "Organization",
      name: "Team Calendar",
      url: resolveCanonicalWebUrl().href,
    },
    url: blogUrl,
  };

  return (
    <main className={`fmkt-page ${styles.page}`} id="blog-main" tabIndex={-1}>
      <JsonLd code={jsonLd} />
      <header className={styles.indexHero}>
        <div className={styles.indexHeroInner}>
          <p className={styles.eyebrow}>Team Calendar guides</p>
          <h1>Make leave and calendars easier to trust.</h1>
          <p>
            Practical explanations for Xero Payroll leave, secure calendar feeds
            and the availability decisions Australian teams make every week.
          </p>
          <a
            className={`marketing-content-link ${styles.rssLink}`}
            href="/rss.xml"
          >
            <Rss aria-hidden="true" size={16} /> Subscribe with RSS
          </a>
        </div>
      </header>

      <section
        aria-labelledby="articles-heading"
        className={styles.indexSection}
      >
        <div className={styles.indexWidth}>
          <div className={styles.sectionHeading}>
            <p>Read and apply</p>
            <h2 id="articles-heading">Guides and product updates</h2>
          </div>

          {posts.length === 0 ? (
            <div className={styles.emptyState}>
              <h2>No guides published yet</h2>
              <p>
                Setup help is still available while the first practical guides
                are prepared.
              </p>
              <Link className="marketing-content-link" href="/help-centre">
                Open the Help centre <ArrowRight aria-hidden="true" size={17} />
              </Link>
            </div>
          ) : (
            <div className={styles.postGrid}>
              {posts.map((post) => (
                <article
                  className={post.featured ? styles.featuredPost : styles.post}
                  key={post.slug}
                >
                  <div className={styles.postMeta}>
                    <span>{post.category}</span>
                    <time dateTime={post.publishedAt}>
                      {formatBlogDate(post.publishedAt)}
                    </time>
                  </div>
                  <h2>{post.title}</h2>
                  <p>{post.description}</p>
                  <div className={styles.postAuthor}>
                    {post.author} · {post.authorRole}
                  </div>
                  <Link
                    aria-label={`Read ${post.title}`}
                    className={`marketing-content-link ${styles.postLink}`}
                    href={`/blog/${post.slug}`}
                  >
                    Read {post.category}{" "}
                    <ArrowRight aria-hidden="true" size={17} />
                  </Link>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
};

export default BlogIndex;
