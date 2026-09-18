import { resolveCanonicalWebUrl } from "@repo/seo/canonical-url";
import type { BlogPosting, WithContext } from "@repo/seo/json-ld";
import { JsonLd } from "@repo/seo/json-ld";
import { createMetadata } from "@repo/seo/metadata";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  formatBlogDate,
  getAllPosts,
  getPost,
  getRelatedPosts,
} from "@/src/lib/blog";
import styles from "../blog.module.css";
import { ArticleFooter } from "../components/article-footer";

interface BlogPostProperties {
  readonly params: Promise<{ slug: string }>;
}

export const dynamicParams = false;

export const generateMetadata = async ({
  params,
}: BlogPostProperties): Promise<Metadata> => {
  const { slug } = await params;
  const post = getPost(slug);

  if (!post) {
    return { robots: { follow: false, index: false } };
  }

  const canonical = new URL(`/blog/${post.slug}`, resolveCanonicalWebUrl())
    .href;
  return createMetadata({
    alternates: { canonical },
    description: post.description,
    image: new URL("/blog/opengraph-image", resolveCanonicalWebUrl()).href,
    openGraph: {
      authors: [post.author],
      modifiedTime: post.updatedAt,
      publishedTime: post.publishedAt,
      type: "article",
      url: canonical,
    },
    title: post.title,
  });
};

export const generateStaticParams = (): { slug: string }[] =>
  getAllPosts().map(({ slug }) => ({ slug }));

const BlogPostPage = async ({ params }: BlogPostProperties) => {
  const { slug } = await params;
  const post = getPost(slug);

  if (!post) {
    notFound();
  }

  const { Component, ...summary } = post;
  const related = getRelatedPosts(post.slug);
  const canonical = new URL(`/blog/${post.slug}`, resolveCanonicalWebUrl())
    .href;
  const jsonLd: WithContext<BlogPosting> = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    author: { "@type": "Organization", name: post.author },
    dateModified: post.updatedAt ?? post.publishedAt,
    datePublished: post.publishedAt,
    description: post.description,
    headline: post.title,
    mainEntityOfPage: canonical,
    publisher: {
      "@type": "Organization",
      name: "Team Calendar",
      url: resolveCanonicalWebUrl().href,
    },
    url: canonical,
  };

  return (
    <main className={`fmkt-page ${styles.page}`} id="blog-main" tabIndex={-1}>
      <JsonLd code={jsonLd} />
      <article className={styles.article}>
        <Link
          className={`marketing-content-link ${styles.backLink}`}
          href="/blog"
        >
          <ArrowLeft aria-hidden="true" size={17} /> Back to Blog
        </Link>

        <header className={styles.articleHeader}>
          <div className={styles.postMeta}>
            <span>{post.category}</span>
            <time dateTime={post.publishedAt}>
              {formatBlogDate(post.publishedAt)}
            </time>
            {post.updatedAt ? (
              <span>Updated {formatBlogDate(post.updatedAt)}</span>
            ) : null}
          </div>
          <h1>{post.title}</h1>
          <p>{post.description}</p>
          <div className={styles.postAuthor}>
            {post.author} · {post.authorRole}
          </div>
        </header>

        <div className={styles.articleBody}>
          <Component />
        </div>

        <ArticleFooter post={summary} related={related} />
      </article>
    </main>
  );
};

export default BlogPostPage;
