import type { Blog, WithContext } from "@repo/seo/json-ld";
import { JsonLd } from "@repo/seo/json-ld";
import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import Link from "next/link";
import { getAllPosts } from "@/src/lib/blog";

const blogMeta = {
  title: "Blog",
  description: "Updates, guides, and articles from the Team Calendar team.",
};

export const generateMetadata = (): Metadata => createMetadata(blogMeta);

const BlogIndex = async () => {
  const posts = await getAllPosts();

  const jsonLd: WithContext<Blog> = {
    "@type": "Blog",
    "@context": "https://schema.org",
  };

  return (
    <>
      <JsonLd code={jsonLd} />
      <div className="fmkt-page marketing-simple">
        <header className="marketing-simple__hero">
          <div className="fmkt-container">
            <div className="marketing-simple__intro">
              <p className="marketing-simple__kicker">Updates</p>
              <h1 className="marketing-simple__title">{blogMeta.title}</h1>
              <p className="marketing-simple__lead">{blogMeta.description}</p>
            </div>
          </div>
        </header>

        <section className="marketing-simple__section">
          <div className="fmkt-container">
            {posts.length === 0 ? (
              <div className="marketing-simple__panel">
                <h2>No posts yet</h2>
                <p>
                  Check back soon for updates, guides, and articles from the
                  Team Calendar team.
                </p>
              </div>
            ) : (
              <div className="marketing-simple__grid marketing-simple__grid--two">
                {posts.map((post, index) => (
                  <Link
                    className={[
                      "marketing-simple__panel",
                      index === 0 ? "md:col-span-2" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    href={`/blog/${post.slug}`}
                    key={post.slug}
                  >
                    <div className="marketing-simple__meta">
                      <time dateTime={post.frontmatter.date}>
                        {new Date(post.frontmatter.date).toLocaleDateString(
                          "en-AU",
                          {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          }
                        )}
                      </time>
                      {post.frontmatter.author && (
                        <>
                          <span>&middot;</span>
                          <span>{post.frontmatter.author}</span>
                        </>
                      )}
                    </div>
                    <h2>{post.frontmatter.title}</h2>
                    <p>{post.frontmatter.description}</p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  );
};

export default BlogIndex;
